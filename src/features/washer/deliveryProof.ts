import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';

/**
 * Photo proof of delivery (spec 3.4).
 *
 * The storage policy proof_washer_insert keys off the FIRST folder segment of
 * the object name being the order id:
 *   (storage.foldername(name))[1] = orders.id  AND orders.washer_id = auth.uid()
 * so the path must always be `${orderId}/${filename}`. Anything else is rejected
 * with a permission error. advance_order_status() then refuses 'delivered'
 * unless it is handed that path, which is why capture/upload failures have to be
 * surfaced instead of swallowed.
 */
export const DELIVERY_PROOF_BUCKET = 'delivery-proof';

/** Longest edge we upload. Keeps a phone photo well under the 10MB bucket cap. */
const MAX_WIDTH = 1280;
const JPEG_QUALITY = 0.7;

export type ProofSource = 'camera' | 'library';

export class ProofError extends Error {}

/**
 * Prompts the camera (or the library as a fallback) and returns the picked
 * asset, or null when the washer backed out without taking a photo.
 */
export async function captureProofPhoto(
  source: ProofSource,
): Promise<ImagePicker.ImagePickerAsset | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new ProofError(
        'BruinWash needs camera access to record proof of delivery. Enable it in your device settings, or pick the photo from your library.',
      );
    }
  } else {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new ProofError(
        'BruinWash needs photo access to attach proof of delivery. Enable it in your device settings.',
      );
    }
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          allowsEditing: false,
          exif: false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          allowsMultipleSelection: false,
          exif: false,
        });

  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  return asset;
}

interface PreparedImage {
  uri: string;
  base64?: string | null;
  contentType: string;
}

/** Downscales to MAX_WIDTH and re-encodes as JPEG; falls back to the original. */
async function prepare(asset: ImagePicker.ImagePickerAsset): Promise<PreparedImage> {
  try {
    const rendered = await ImageManipulator.manipulate(asset.uri)
      .resize({ width: Math.min(MAX_WIDTH, asset.width || MAX_WIDTH) })
      .renderAsync();
    const saved = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: JPEG_QUALITY,
      base64: true,
    });
    return { uri: saved.uri, base64: saved.base64 ?? null, contentType: 'image/jpeg' };
  } catch {
    // Downscaling is an optimisation, not a requirement — the proof still has
    // to reach the bucket or the job cannot be closed out.
    return {
      uri: asset.uri,
      base64: asset.base64 ?? null,
      contentType: asset.mimeType ?? 'image/jpeg',
    };
  }
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Minimal base64 -> bytes so no polyfill or extra package is needed. */
function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let written = 0;
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < clean.length; i += 1) {
    const value = B64_ALPHABET.indexOf(clean.charAt(i));
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[written] = (buffer >> bits) & 0xff;
      written += 1;
    }
  }

  return out.subarray(0, written);
}

async function toBytes(image: PreparedImage): Promise<Uint8Array> {
  // The blob path is what Supabase documents for Expo; the base64 fallback
  // covers runtimes where a file:// blob comes back empty.
  try {
    const buffer = await fetch(image.uri).then((res) => res.arrayBuffer());
    if (buffer.byteLength > 0) return new Uint8Array(buffer);
  } catch {
    // fall through to base64
  }

  if (image.base64) {
    const bytes = base64ToBytes(image.base64);
    if (bytes.byteLength > 0) return bytes;
  }

  throw new ProofError('That photo could not be read from your device. Try taking it again.');
}

function extensionFor(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('heic')) return 'heic';
  return 'jpg';
}

/**
 * Uploads the proof and returns the storage path to hand to
 * advance_order_status(p_order_id, 'delivered', p_photo_path).
 */
export async function uploadDeliveryProof(
  orderId: string,
  asset: ImagePicker.ImagePickerAsset,
): Promise<string> {
  const image = await prepare(asset);
  const bytes = await toBytes(image);
  // FIRST segment must be the order id — the storage RLS policy reads it.
  const path = `${orderId}/proof-${Date.now()}.${extensionFor(image.contentType)}`;

  const { error } = await supabase.storage
    .from(DELIVERY_PROOF_BUCKET)
    .upload(path, bytes, { contentType: image.contentType, upsert: false });

  if (error) {
    throw new ProofError(
      'The delivery photo could not be uploaded. Check your connection and try again — the order stays out for delivery until it lands.',
    );
  }

  return path;
}

/**
 * The booking handover contract between app/(requester)/schedule.tsx and
 * app/checkout.tsx.
 *
 * Expo Router serialises every param to a string (or an array of strings when a
 * key repeats), so the schedule screen hands over primitives and checkout
 * rebuilds the booking here. The reader deliberately accepts both camelCase and
 * the snake_case spelling of the matching create_order argument, because the two
 * screens are written independently and either spelling is a reasonable guess.
 *
 * Nothing about money travels through here: the server prices the order.
 */
import type { ServiceTier } from '@/types/database';
import { DEFAULT_WASH_SETTINGS } from '@/constants/pricing';

export interface CheckoutBooking {
  buildingId: string;
  /** Display only — the order is created from buildingId. */
  buildingName: string | null;
  floor: string;
  roomNumber: string | null;
  /** ISO 8601 timestamp. */
  pickupAt: string;
  tier: ServiceTier;
  loads: number;
  pods: boolean;
  gloves: boolean;
  liabilityAck: boolean;
  washCycle: string;
  washTemp: string;
  dryLevel: string;
  notes: string | null;
}

export type CheckoutParamMap = Record<string, string | string[] | undefined>;

function first(params: CheckoutParamMap, keys: readonly string[]): string | null {
  for (const key of keys) {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

function bool(params: CheckoutParamMap, keys: readonly string[]): boolean {
  const value = first(params, keys);
  if (value === null) return false;
  return ['1', 'true', 'yes', 'y', 'on'].includes(value.toLowerCase());
}

function int(params: CheckoutParamMap, keys: readonly string[], fallback: number): number {
  const value = first(params, keys);
  if (value === null) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const KEYS = {
  buildingId: ['buildingId', 'building_id', 'building'],
  buildingName: ['buildingName', 'building_name'],
  floor: ['floor'],
  roomNumber: ['roomNumber', 'room_number', 'room'],
  pickupAt: ['pickupAt', 'pickup_at', 'pickupTime', 'pickup_time', 'pickup'],
  tier: ['tier', 'service_tier', 'serviceTier'],
  loads: ['loads', 'loadCount', 'load_count'],
  pods: ['pods', 'addDetergentPods', 'add_detergent_pods', 'detergentPods'],
  gloves: ['gloves', 'addGloves', 'add_gloves'],
  liabilityAck: ['liabilityAck', 'liability_ack', 'liabilityAccepted', 'ack'],
  washCycle: ['washCycle', 'wash_cycle', 'cycle'],
  washTemp: ['washTemp', 'wash_temp', 'temp'],
  dryLevel: ['dryLevel', 'dry_level', 'level'],
  notes: ['notes', 'note'],
} as const;

export interface ParsedBooking {
  booking: CheckoutBooking;
  /** Human-readable names of anything checkout cannot proceed without. */
  missing: string[];
}

/**
 * Rebuilds the booking from route params. Always returns a booking so the sheet
 * can still render its chrome, plus the list of fields that are missing so it
 * can explain itself instead of failing inside create_order.
 */
export function parseCheckoutParams(params: CheckoutParamMap): ParsedBooking {
  const missing: string[] = [];

  const buildingId = first(params, KEYS.buildingId);
  if (!buildingId) missing.push('building');

  const floor = first(params, KEYS.floor);
  if (!floor) missing.push('floor');

  const pickupAtRaw = first(params, KEYS.pickupAt);
  let pickupAt = '';
  if (!pickupAtRaw) {
    missing.push('pickup time');
  } else {
    // Accept an ISO string or epoch milliseconds.
    const asNumber = Number(pickupAtRaw);
    const date = Number.isFinite(asNumber) && pickupAtRaw.length >= 10 && !pickupAtRaw.includes('-')
      ? new Date(asNumber)
      : new Date(pickupAtRaw);
    if (Number.isNaN(date.getTime())) {
      missing.push('pickup time');
    } else {
      pickupAt = date.toISOString();
    }
  }

  const tierRaw = first(params, KEYS.tier);
  const tier: ServiceTier = tierRaw === 'standard' || tierRaw === 'full' ? tierRaw : 'full';
  if (tierRaw !== 'standard' && tierRaw !== 'full') missing.push('service level');

  const liabilityAck = bool(params, KEYS.liabilityAck);
  if (!liabilityAck) missing.push('liability acknowledgement');

  return {
    booking: {
      buildingId: buildingId ?? '',
      buildingName: first(params, KEYS.buildingName),
      floor: floor ?? '',
      roomNumber: first(params, KEYS.roomNumber),
      pickupAt,
      tier,
      loads: Math.max(int(params, KEYS.loads, 1), 1),
      pods: bool(params, KEYS.pods),
      gloves: bool(params, KEYS.gloves),
      liabilityAck,
      washCycle: first(params, KEYS.washCycle) ?? DEFAULT_WASH_SETTINGS.cycle,
      washTemp: first(params, KEYS.washTemp) ?? DEFAULT_WASH_SETTINGS.temp,
      dryLevel: first(params, KEYS.dryLevel) ?? DEFAULT_WASH_SETTINGS.level,
      notes: first(params, KEYS.notes),
    },
    missing,
  };
}

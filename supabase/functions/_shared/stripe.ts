/**
 * A very small Stripe REST client.
 *
 * Deliberately not the Stripe SDK: the surface we need is four endpoints, and
 * calling the documented REST API with fetch means there is no SDK version
 * skew to guess at inside the Deno runtime.
 *
 * Stripe's API is form-encoded with bracket notation for nested params
 * (`automatic_payment_methods[enabled]=true`), which toFormBody() produces.
 */
import { HttpError, env, requireEnv } from './supabase.ts';

const STRIPE_API = 'https://api.stripe.com';

export function stripeSecretKey(): string {
  return requireEnv('STRIPE_SECRET_KEY');
}

export function stripeConfigured(): boolean {
  return Boolean(env('STRIPE_SECRET_KEY'));
}

/**
 * The API version stamped on the ephemeral key. Stripe requires an explicit
 * Stripe-Version header when creating one; it should match (or be close to) the
 * version the native mobile SDK speaks. Override with the STRIPE_API_VERSION
 * secret if the Payment Sheet ever complains about a version mismatch.
 */
export function stripeApiVersion(): string {
  return env('STRIPE_API_VERSION', '2024-06-20') as string;
}

/** Flattens a nested object into Stripe's bracketed form encoding. */
export function toFormBody(
  input: Record<string, unknown>,
  prefix = '',
  params: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  for (const [rawKey, value] of Object.entries(input)) {
    const key = prefix ? `${prefix}[${rawKey}]` : rawKey;
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item !== null && typeof item === 'object') {
          toFormBody(item as Record<string, unknown>, `${key}[${index}]`, params);
        } else {
          params.append(`${key}[]`, String(item));
        }
      });
    } else if (typeof value === 'object') {
      toFormBody(value as Record<string, unknown>, key, params);
    } else {
      params.append(key, String(value));
    }
  }
  return params;
}

interface StripeRequestOptions {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  query?: Record<string, string>;
  /** Stripe replays the first response for a repeated key — makes retries safe. */
  idempotencyKey?: string;
  apiVersion?: string;
}

interface StripeErrorShape {
  error?: { message?: string; type?: string; code?: string };
}

export async function stripeRequest<T>(
  path: string,
  options: StripeRequestOptions = {},
): Promise<T> {
  const method = options.method ?? 'POST';
  const url = new URL(`${STRIPE_API}${path}`);
  for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, v);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${stripeSecretKey()}`,
  };
  if (options.apiVersion) headers['Stripe-Version'] = options.apiVersion;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  let body: string | undefined;
  if (method === 'POST') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = toFormBody(options.body ?? {}).toString();
  }

  const res = await fetch(url.toString(), { method, headers, body });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const message = (parsed as StripeErrorShape | null)?.error?.message;
    console.error(`[stripe] ${method} ${path} -> ${res.status}`, message ?? text);
    // 4xx from Stripe is usually actionable copy ("Your card was declined").
    throw new HttpError(
      message ?? 'Stripe rejected that request. Please try again.',
      res.status >= 500 ? 502 : 400,
    );
  }

  return parsed as T;
}

// ------------------------------------------------------- object shapes -------
// Only the fields these functions actually read.

export interface StripeCustomer {
  id: string;
  deleted?: boolean;
}

export interface StripeEphemeralKey {
  id: string;
  secret: string;
}

export interface StripePaymentIntent {
  id: string;
  client_secret: string | null;
  status: string;
  amount: number;
  currency: string;
  customer: string | null;
  metadata?: Record<string, string>;
}

export interface StripeAccount {
  id: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
}

export interface StripeAccountLink {
  url: string;
  expires_at: number;
}

export interface StripeCharge {
  id: string;
  amount: number;
  amount_refunded: number;
  refunded: boolean;
  payment_intent: string | null;
  metadata?: Record<string, string>;
}

/**
 * A PaymentIntent in one of these states can still be paid by the sheet, so a
 * retry on the same order reuses it instead of leaking a new intent.
 */
export const REUSABLE_INTENT_STATUSES = new Set([
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
]);

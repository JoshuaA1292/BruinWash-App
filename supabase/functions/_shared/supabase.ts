/**
 * Supabase / auth helpers shared by every BruinWash Edge Function.
 *
 * Two clients matter here:
 *   serviceClient()  — bypasses RLS. Used for every read/write these functions
 *                      make, because the money and push tables are deliberately
 *                      unreachable from the `authenticated` role.
 *   requireCaller()   — verifies the end user's JWT so we know *who* is asking
 *                      before we trust them with anything.
 *
 * Nothing in here ever trusts a client-supplied amount, order total, or user id.
 */
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/** Re-exported so the functions do not each need the jsr specifier. */
export type { SupabaseClient };

// ------------------------------------------------------------------- env ----

export function env(name: string, fallback?: string): string | undefined {
  const value = Deno.env.get(name);
  if (value === undefined || value === '') return fallback;
  return value;
}

export function requireEnv(name: string): string {
  const value = env(name);
  if (!value) {
    throw new HttpError(
      `Server is not configured (missing ${name}). Please try again later.`,
      500,
    );
  }
  return value;
}

/** An error that already knows which HTTP status it should become. */
export class HttpError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

// ---------------------------------------------------------------- clients ----

export function supabaseUrl(): string {
  return requireEnv('SUPABASE_URL');
}

/**
 * The service-role key. Supabase injects SUPABASE_SERVICE_ROLE_KEY into every
 * function automatically; SERVICE_ROLE_KEY is honoured as an escape hatch for
 * projects that have migrated to the newer `sb_secret_...` key format.
 */
export function serviceRoleKey(): string {
  const key = env('SUPABASE_SERVICE_ROLE_KEY') ?? env('SERVICE_ROLE_KEY');
  if (!key) {
    throw new HttpError('Server is not configured (missing service role key).', 500);
  }
  return key;
}

export function serviceClient(): SupabaseClient {
  return createClient(supabaseUrl(), serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'X-Client-Info': 'bruinwash-edge' } },
  });
}

// ------------------------------------------------------------------- auth ----

/** Pulls the raw bearer token out of the Authorization header. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization') ?? req.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** Decodes a JWT payload without verifying it. Only ever used to read claims
 *  from a token the platform (verify_jwt) has already verified. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(padded);
    const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * True when the caller presented the service-role key — which is how the
 * kick_push_dispatch() database trigger calls dispatch-push.
 */
export function callerIsServiceRole(req: Request): boolean {
  const token = bearerToken(req);
  if (!token) return false;
  if (timingSafeEqual(token, serviceRoleKey())) return true;
  const claims = decodeJwtPayload(token);
  return claims?.role === 'service_role';
}

export interface Caller {
  id: string;
  email: string | null;
}

/**
 * Verifies the end user's access token and returns their auth user. Throws 401
 * when there is no usable token — never falls back to "some" user.
 */
export async function requireCaller(req: Request, admin: SupabaseClient): Promise<Caller> {
  const token = bearerToken(req);
  if (!token) {
    throw new HttpError('Please sign in and try again.', 401);
  }
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    throw new HttpError('Your session has expired. Please sign in again.', 401);
  }
  return { id: data.user.id, email: data.user.email ?? null };
}

/** True when the signed-in caller is an admin profile. */
export async function callerIsAdmin(req: Request, admin: SupabaseClient): Promise<boolean> {
  try {
    const caller = await requireCaller(req, admin);
    const { data } = await admin
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle();
    return data?.role === 'admin';
  } catch {
    return false;
  }
}

/**
 * Gate for the two operator-facing functions (dispatch-push, admin-notify):
 * the database trigger or an admin, nobody else. verify_jwt only proves the
 * token belongs to *this project* — any signed-in student would otherwise pass.
 */
export async function requireOperator(req: Request, admin: SupabaseClient): Promise<void> {
  if (callerIsServiceRole(req)) return;
  if (await callerIsAdmin(req, admin)) return;
  throw new HttpError('Not authorised.', 403);
}

// ------------------------------------------------------------------ utils ----

/** Constant-time string compare, so a token check cannot be timed. */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Comparing lengths first would leak length, but an unequal length can never
  // be equal anyway; fold it into the accumulator instead of returning early.
  let diff = ab.length ^ bb.length;
  const max = Math.max(ab.length, bb.length);
  for (let i = 0; i < max; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/** Splits a list into chunks of at most `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Parses a JSON body, tolerating an empty one (the DB trigger sends `{}`). */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const text = await req.text();
    if (!text.trim()) return {} as T;
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError('That request could not be read.', 400);
  }
}

/** Turns any thrown value into a Response. */
export function errorResponse(
  e: unknown,
  toResponse: (message: string, status: number) => Response,
): Response {
  if (e instanceof HttpError) {
    if (e.status >= 500) console.error('[edge]', e.message);
    return toResponse(e.message, e.status);
  }
  const message = e instanceof Error ? e.message : String(e);
  console.error('[edge] unhandled:', message);
  return toResponse('Something went wrong on our end. Please try again.', 500);
}

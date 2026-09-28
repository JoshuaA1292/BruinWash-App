/**
 * CORS + response helpers shared by every BruinWash Edge Function.
 *
 * Deno / Supabase Edge Runtime. Nothing in supabase/functions/ is part of the
 * React Native bundle, so `npx tsc --noEmit` does not cover these files.
 */

/**
 * `stripe-signature` is listed because the Stripe webhook is invoked by Stripe
 * rather than a browser, and `apikey` / `x-client-info` because that is what
 * supabase-js sends from the app.
 */
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

/** Answers a CORS preflight. Returns null when the request is not a preflight. */
export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }
  return null;
}

/** JSON response with CORS headers applied. */
export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extra, 'Content-Type': 'application/json' },
  });
}

/**
 * Error response. The message is deliberately plain English: the app funnels it
 * through friendlyError() and shows it to a student.
 */
export function fail(message: string, status = 400, extra?: Record<string, unknown>): Response {
  return json({ error: message, ...(extra ?? {}) }, status);
}

/** A 302 with CORS headers, used for the Stripe Connect deep-link bounce. */
export function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: location },
  });
}

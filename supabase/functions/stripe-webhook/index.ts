/**
 * stripe-webhook — the only thing in the system allowed to say "this is paid".
 *
 * DEPLOY WITH verify_jwt DISABLED:
 *   supabase functions deploy stripe-webhook --no-verify-jwt
 * Stripe does not send a Supabase JWT. Authenticity comes from the
 * `stripe-signature` header instead, which is verified below with HMAC-SHA256
 * against STRIPE_WEBHOOK_SECRET. An unverified request is rejected with 400 and
 * nothing is read or written.
 *
 * Signature verification is done by hand rather than with the Stripe SDK's
 * constructEvent(), which needs synchronous crypto that Deno does not have. The
 * scheme is the documented one: sign `<timestamp>.<raw body>` and compare
 * against the v1 signatures in the header.
 *
 * Events handled:
 *   payment_intent.succeeded      -> orders.payment_status = 'paid'
 *   payment_intent.payment_failed -> orders.payment_status = 'failed'
 *   charge.refunded               -> 'refunded' | 'partially_refunded' + refund_cents
 *   account.updated               -> profiles.stripe_onboarding_done (Connect)
 *
 * The 'paid' write is the important one: the orders_notify trigger turns that
 * single transition into the entire "Order placed" fan-out (requester
 * confirmation, every washer in the building, the admin). It is idempotent in
 * both directions — the trigger only fires on a real unpaid -> paid transition,
 * and Stripe retries are re-checked against the current row before writing.
 */
import { preflight, json, fail } from '../_shared/cors.ts';
import {
  type SupabaseClient,
  errorResponse,
  env,
  requireEnv,
  serviceClient,
  timingSafeEqual,
} from '../_shared/supabase.ts';

interface StripeEvent {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    if (req.method !== 'POST') return fail('Method not allowed.', 405);

    const signature = req.headers.get('stripe-signature');
    // Read the body exactly once, as text: the bytes Stripe signed are the bytes
    // we must hash. Parsing and re-serialising would change them.
    const rawBody = await req.text();

    if (!signature) return fail('Missing stripe-signature header.', 400);

    const secret = requireEnv('STRIPE_WEBHOOK_SECRET');
    const verified = await verifySignature(rawBody, signature, secret);
    if (!verified) {
      console.warn('[webhook] rejected: signature did not verify');
      return fail('Signature verification failed.', 400);
    }

    let event: StripeEvent;
    try {
      event = JSON.parse(rawBody) as StripeEvent;
    } catch {
      return fail('Malformed event payload.', 400);
    }

    const admin = serviceClient();
    const object = event.data?.object ?? {};

    switch (event.type) {
      case 'payment_intent.succeeded':
        await onPaymentSucceeded(admin, object);
        break;
      case 'payment_intent.payment_failed':
        await onPaymentFailed(admin, object);
        break;
      case 'charge.refunded':
        await onChargeRefunded(admin, object);
        break;
      case 'account.updated':
        await onAccountUpdated(admin, object);
        break;
      default:
        // Everything else is acknowledged so Stripe stops retrying it.
        break;
    }

    return json({ received: true, type: event.type, id: event.id });
  } catch (e) {
    // A 5xx tells Stripe to retry, which is what we want for a transient fault.
    return errorResponse(e, (message, status) => fail(message, status));
  }
});

// ------------------------------------------------------------ verification ---

/**
 * Verifies a Stripe webhook signature header of the form
 * `t=1614556800,v1=<hex>,v1=<hex>` (several v1 values appear while a secret is
 * being rotated). Returns false for anything it cannot prove.
 */
async function verifySignature(
  rawBody: string,
  header: string,
  secret: string,
): Promise<boolean> {
  let timestamp: string | null = null;
  const signatures: string[] = [];

  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2).map((s) => s?.trim() ?? '');
    if (key === 't') timestamp = value;
    else if (key === 'v1' && value) signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) return false;

  // Replay protection: reject anything outside the tolerance window.
  const toleranceSeconds = Number(env('STRIPE_WEBHOOK_TOLERANCE', '300'));
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return false;
  const skew = Math.abs(Math.floor(Date.now() / 1000) - sentAt);
  if (Number.isFinite(toleranceSeconds) && toleranceSeconds > 0 && skew > toleranceSeconds) {
    console.warn(`[webhook] rejected: timestamp ${skew}s outside tolerance`);
    return false;
  }

  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  return signatures.some((candidate) => timingSafeEqual(candidate, expected));
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// --------------------------------------------------------------- handlers ----

interface OrderRef {
  id: string;
  payment_status: string;
  total_cents: number;
  refund_cents: number;
}

/**
 * Finds the order an event belongs to. metadata.order_id is what this codebase
 * always sets; stripe_payment_intent_id is the fallback for an intent created
 * outside the app (a dashboard charge, say).
 */
async function findOrder(
  admin: SupabaseClient,
  metadataOrderId: string | null,
  paymentIntentId: string | null,
): Promise<OrderRef | null> {
  const columns = 'id, payment_status, total_cents, refund_cents';

  if (metadataOrderId) {
    const { data, error } = await admin
      .from('orders')
      .select(columns)
      .eq('id', metadataOrderId)
      .maybeSingle();
    if (error) throw new Error(`looking up order by id: ${error.message}`);
    if (data) return data as OrderRef;
  }

  if (paymentIntentId) {
    const { data, error } = await admin
      .from('orders')
      .select(columns)
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle();
    if (error) throw new Error(`looking up order by intent: ${error.message}`);
    if (data) return data as OrderRef;
  }

  return null;
}

function metaOrderId(object: Record<string, unknown>): string | null {
  const metadata = object.metadata as Record<string, string> | undefined;
  const id = metadata?.order_id;
  return typeof id === 'string' && id ? id : null;
}

async function onPaymentSucceeded(
  admin: SupabaseClient,
  object: Record<string, unknown>,
): Promise<void> {
  const intentId = typeof object.id === 'string' ? object.id : null;
  const order = await findOrder(admin, metaOrderId(object), intentId);
  if (!order) {
    console.warn('[webhook] payment_intent.succeeded for an unknown order', intentId);
    return;
  }

  // Idempotent: a Stripe retry finds the order already paid and does nothing, so
  // the orders_notify trigger cannot fan out twice.
  if (order.payment_status === 'paid') return;
  // A refund that arrived first must not be undone by a late success event.
  if (order.payment_status === 'refunded' || order.payment_status === 'partially_refunded') {
    return;
  }

  const patch: Record<string, unknown> = { payment_status: 'paid' };
  if (intentId) patch.stripe_payment_intent_id = intentId;

  const { error } = await admin
    .from('orders')
    .update(patch)
    .eq('id', order.id)
    .neq('payment_status', 'paid');
  if (error) {
    // Throwing makes this a 5xx, which asks Stripe to retry. The "Order placed"
    // fan-out depends on this write, so a silent failure is not acceptable.
    throw new Error(`marking order paid: ${error.message}`);
  }
  console.log(`[webhook] order ${order.id} -> paid`);
}

async function onPaymentFailed(
  admin: SupabaseClient,
  object: Record<string, unknown>,
): Promise<void> {
  const intentId = typeof object.id === 'string' ? object.id : null;
  const order = await findOrder(admin, metaOrderId(object), intentId);
  if (!order) return;

  // Never downgrade an order that is already funded or refunded.
  if (
    order.payment_status === 'paid' ||
    order.payment_status === 'refunded' ||
    order.payment_status === 'partially_refunded'
  ) {
    return;
  }
  if (order.payment_status === 'failed') return;

  const { error } = await admin
    .from('orders')
    .update({ payment_status: 'failed' })
    .eq('id', order.id)
    .in('payment_status', ['unpaid', 'processing']);
  if (error) throw new Error(`marking order failed: ${error.message}`);
  console.log(`[webhook] order ${order.id} -> failed`);
}

async function onChargeRefunded(
  admin: SupabaseClient,
  object: Record<string, unknown>,
): Promise<void> {
  const paymentIntentId =
    typeof object.payment_intent === 'string' ? object.payment_intent : null;
  const order = await findOrder(admin, metaOrderId(object), paymentIntentId);
  if (!order) {
    console.warn('[webhook] charge.refunded for an unknown order', paymentIntentId);
    return;
  }

  const amount = Number(object.amount ?? 0);
  const refunded = Number(object.amount_refunded ?? 0);
  // Fully refunded when Stripe says so, or when the refunded amount covers the
  // charge. Comparing against the charge (not the order) keeps partial captures
  // and multi-charge edge cases honest.
  const full = object.refunded === true || (amount > 0 && refunded >= amount);
  const status = full ? 'refunded' : 'partially_refunded';

  if (order.payment_status === status && order.refund_cents === refunded) return;

  const { error } = await admin
    .from('orders')
    .update({ payment_status: status, refund_cents: Math.max(0, Math.round(refunded)) })
    .eq('id', order.id);
  if (error) throw new Error(`recording refund: ${error.message}`);
  console.log(`[webhook] order ${order.id} -> ${status} (${refunded} cents)`);
}

/**
 * Connect status refresh. Stripe sends account.updated for a connected account
 * as it clears verification, which is how a washer's payout readiness becomes
 * true without the app polling. Requires the webhook endpoint to be listening to
 * connected-account events (see README).
 */
async function onAccountUpdated(
  admin: SupabaseClient,
  object: Record<string, unknown>,
): Promise<void> {
  const accountId = typeof object.id === 'string' ? object.id : null;
  if (!accountId) return;

  const done = object.charges_enabled === true && object.details_submitted === true;

  const { data, error } = await admin
    .from('profiles')
    .update({ stripe_onboarding_done: done })
    .eq('stripe_account_id', accountId)
    .select('id');
  if (error) {
    console.error('[webhook] could not update onboarding state:', error.message);
    return;
  }
  if ((data ?? []).length === 0) {
    console.warn('[webhook] account.updated for an unknown account', accountId);
    return;
  }
  console.log(`[webhook] account ${accountId} onboarding_done=${done}`);
}

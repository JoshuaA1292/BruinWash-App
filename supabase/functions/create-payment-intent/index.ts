/**
 * create-payment-intent — funds an order that create_order() has already priced.
 *
 * Called by the checkout screen with { order_id } and nothing else.
 *
 *   THE AMOUNT COMES FROM THE ORDER ROW, NEVER FROM THE REQUEST BODY.
 *
 * The database is authoritative for money: public.create_order() computed
 * orders.total_cents server-side via price_order(), and this function re-reads
 * that row with the service role. A client that posts an amount, a total, or
 * somebody else's order id gets nowhere.
 *
 * Returns the four keys Stripe's React Native Payment Sheet expects:
 *   { paymentIntent, ephemeralKey, customer, publishableKey }
 *
 * The order is left at payment_status 'processing'. Only the stripe-webhook
 * function promotes it to 'paid' — that single write is what fires the whole
 * "Order placed" fan-out, and it must come from Stripe, not from a phone.
 */
import { preflight, json, fail } from '../_shared/cors.ts';
import {
  HttpError,
  env,
  errorResponse,
  readJson,
  requireCaller,
  serviceClient,
} from '../_shared/supabase.ts';
import {
  REUSABLE_INTENT_STATUSES,
  type StripeCustomer,
  type StripeEphemeralKey,
  type StripePaymentIntent,
  stripeApiVersion,
  stripeRequest,
} from '../_shared/stripe.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface OrderRow {
  id: string;
  requester_id: string;
  status: string;
  payment_status: string;
  total_cents: number;
  tier: string;
  load_count: number;
  stripe_payment_intent_id: string | null;
}

interface ProfileRow {
  stripe_customer_id: string | null;
  first_name: string | null;
  last_name: string | null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    if (req.method !== 'POST') return fail('Method not allowed.', 405);

    const admin = serviceClient();
    // 1. Who is asking? Verified from the Authorization header, not the body.
    const caller = await requireCaller(req, admin);

    const body = await readJson<{ order_id?: unknown }>(req);
    const orderId = typeof body.order_id === 'string' ? body.order_id.trim() : '';
    if (!UUID_RE.test(orderId)) {
      throw new HttpError('That order could not be found.', 400);
    }

    // 2. Re-read the order with the service role. This row is the only source
    //    of truth for what the card gets charged.
    const { data: orderData, error: orderError } = await admin
      .from('orders')
      .select(
        'id, requester_id, status, payment_status, total_cents, tier, load_count, stripe_payment_intent_id',
      )
      .eq('id', orderId)
      .maybeSingle();

    if (orderError) throw new Error(`reading order: ${orderError.message}`);
    const order = orderData as OrderRow | null;

    // Same message whether it is missing or somebody else's: a requester must
    // not be able to probe for order ids.
    if (!order || order.requester_id !== caller.id) {
      throw new HttpError('That order could not be found.', 404);
    }
    if (order.status === 'cancelled') {
      throw new HttpError('That order has been cancelled.', 409);
    }
    if (order.payment_status === 'paid') {
      throw new HttpError('That order has already been paid for.', 409);
    }
    if (order.payment_status === 'refunded' || order.payment_status === 'partially_refunded') {
      throw new HttpError('That order has already been refunded.', 409);
    }
    if (!Number.isInteger(order.total_cents) || order.total_cents <= 0) {
      throw new HttpError('That order has no amount to charge.', 409);
    }

    // 3. Stripe Customer — created once per profile and reused forever after, so
    //    the Payment Sheet can offer saved cards.
    const { data: profileData, error: profileError } = await admin
      .from('profiles')
      .select('stripe_customer_id, first_name, last_name')
      .eq('id', caller.id)
      .maybeSingle();
    if (profileError) throw new Error(`reading profile: ${profileError.message}`);
    const profile = (profileData ?? {}) as ProfileRow;

    const priorCustomerId = profile.stripe_customer_id ?? null;
    let customerId = priorCustomerId;
    if (customerId) {
      // Confirm it still exists — a customer deleted in the dashboard would make
      // every later call fail with a confusing error. A 4xx means genuinely gone;
      // a 5xx is Stripe having a moment, and throwing away a customer over that
      // would lose the student's saved cards, so keep it and let Stripe decide.
      try {
        const existing = await stripeRequest<StripeCustomer>(`/v1/customers/${customerId}`, {
          method: 'GET',
        });
        if (existing.deleted) customerId = null;
      } catch (e) {
        if (e instanceof HttpError && e.status === 400) customerId = null;
        else console.warn('[pay] could not verify customer:', (e as Error).message);
      }
    }

    if (!customerId) {
      const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
      const customer = await stripeRequest<StripeCustomer>('/v1/customers', {
        body: {
          ...(caller.email ? { email: caller.email } : {}),
          ...(name ? { name } : {}),
          metadata: { supabase_user_id: caller.id },
        },
        // Deterministic so a double-tap makes one customer. The suffix keys a
        // replacement separately, so it cannot replay the deleted one.
        idempotencyKey: priorCustomerId
          ? `bw_customer_${caller.id}_${priorCustomerId}`
          : `bw_customer_${caller.id}`,
      });
      customerId = customer.id;

      // stripe_customer_id is server-managed: guard_profile_privileges() blocks
      // the client from writing it, and the service role is exempt.
      const { error } = await admin
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', caller.id);
      if (error) console.error('[pay] could not save stripe_customer_id:', error.message);
    }

    // 4. Ephemeral key. Optional: the checkout hook only attaches the customer
    //    when both the id and the key came back, so a failure here degrades to a
    //    guest-style sheet rather than blocking the payment.
    let ephemeralKeySecret: string | null = null;
    try {
      const key = await stripeRequest<StripeEphemeralKey>('/v1/ephemeral_keys', {
        body: { customer: customerId },
        apiVersion: stripeApiVersion(),
      });
      ephemeralKeySecret = key.secret ?? null;
    } catch (e) {
      console.warn('[pay] ephemeral key unavailable:', (e as Error).message);
    }

    // 5. PaymentIntent. A retry after a cancelled sheet funds the SAME order, so
    //    reuse the existing intent instead of leaking a new one per tap.
    let intent: StripePaymentIntent | null = null;
    let deadIntentId: string | null = null;

    if (order.stripe_payment_intent_id) {
      let existing: StripePaymentIntent | null = null;
      try {
        existing = await stripeRequest<StripePaymentIntent>(
          `/v1/payment_intents/${order.stripe_payment_intent_id}`,
          { method: 'GET' },
        );
      } catch (e) {
        console.warn('[pay] could not retrieve existing intent:', (e as Error).message);
      }

      if (existing?.status === 'succeeded') {
        // The webhook has not landed yet (or was missed). Promote the order here
        // too: the trigger only fires on the unpaid -> paid transition, so doing
        // it twice is harmless, and doing it never would strand the order.
        await markPaid(admin, order.id);
        throw new HttpError('That order has already been paid for.', 409);
      }
      if (existing?.status === 'processing') {
        throw new HttpError(
          'That payment is still being confirmed. Give it a moment and check your order.',
          409,
        );
      }
      if (existing && REUSABLE_INTENT_STATUSES.has(existing.status)) {
        // Keep it in step with the order row in case either drifted.
        if (existing.amount !== order.total_cents || existing.customer !== customerId) {
          intent = await stripeRequest<StripePaymentIntent>(
            `/v1/payment_intents/${existing.id}`,
            {
              body: {
                amount: order.total_cents,
                customer: customerId,
                metadata: { order_id: order.id, requester_id: caller.id },
              },
            },
          );
        } else {
          intent = existing;
        }
      } else if (existing) {
        deadIntentId = existing.id; // cancelled / unusable — make a fresh one
      }
    }

    if (!intent) {
      intent = await stripeRequest<StripePaymentIntent>('/v1/payment_intents', {
        body: {
          amount: order.total_cents, // <- from the ORDER ROW
          currency: 'usd',
          customer: customerId,
          automatic_payment_methods: { enabled: true },
          description: `CampusWash ${order.tier === 'full' ? 'Wash, Dry & Fold' : 'Wash & Dry'} x${order.load_count}`,
          metadata: { order_id: order.id, requester_id: caller.id },
        },
        // Deterministic, so a double-tap or a network retry reuses one intent.
        // The dead-intent suffix keeps a replacement from replaying the old key.
        idempotencyKey: deadIntentId
          ? `bw_pi_${order.id}_${deadIntentId}`
          : `bw_pi_${order.id}`,
      });
    }

    if (!intent.client_secret) {
      throw new HttpError('We could not start that payment. Please try again.', 502);
    }

    // 6. Record the intent and move the order to 'processing'. The payment_status
    //    filter means a webhook that already marked it paid wins the race.
    const { error: saveError } = await admin
      .from('orders')
      .update({ stripe_payment_intent_id: intent.id, payment_status: 'processing' })
      .eq('id', order.id)
      .in('payment_status', ['unpaid', 'failed', 'processing']);
    if (saveError) console.error('[pay] could not save payment intent:', saveError.message);

    return json({
      paymentIntent: intent.client_secret,
      ephemeralKey: ephemeralKeySecret,
      customer: customerId,
      publishableKey: env('STRIPE_PUBLISHABLE_KEY') ?? null,
    });
  } catch (e) {
    return errorResponse(e, (message, status) => fail(message, status));
  }
});

/** Safety net for a missed webhook. Idempotent: the DB trigger only fans out on
 *  the unpaid -> paid transition. */
async function markPaid(
  admin: ReturnType<typeof serviceClient>,
  orderId: string,
): Promise<void> {
  const { error } = await admin
    .from('orders')
    .update({ payment_status: 'paid' })
    .eq('id', orderId)
    .neq('payment_status', 'paid');
  if (error) console.error('[pay] could not mark order paid:', error.message);
}

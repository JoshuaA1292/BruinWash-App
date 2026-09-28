/**
 * process-refund — turns queued refunds into real Stripe refunds.
 *
 * cancel_order() only ever WRITES A ROW into public.refunds; it never claims the
 * money moved. This function is what actually moves it, and the webhook's
 * charge.refunded branch is what finally settles orders.payment_status. Until
 * that happens the order screen says the refund is being processed, which is the
 * truth.
 *
 * Invoked by the kick_refund_dispatch() database trigger with a service-role
 * bearer token and an empty body, exactly like dispatch-push. Also safe to
 * invoke manually or on a schedule to drain anything a failed kick left behind.
 *
 * CLAIMING. status doubles as the claim: a single
 * `update ... where status = 'pending'` is atomic per row, so two concurrent
 * invocations can never refund the same order twice. A row that then fails is
 * marked 'failed' with the reason, so it cannot loop forever.
 *
 * IDEMPOTENCY. Every Stripe call carries an Idempotency-Key derived from the
 * order id, so even a retry that races past the claim cannot double-refund.
 */
import { preflight, json, fail } from '../_shared/cors.ts';
import {
  errorResponse,
  requireOperator,
  serviceClient,
} from '../_shared/supabase.ts';
import { stripeConfigured, stripeRequest } from '../_shared/stripe.ts';

const MAX_ROWS_PER_RUN = 50;

interface RefundRow {
  id: string;
  order_id: string;
  amount_cents: number;
}

interface StripeRefund {
  id: string;
  status: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const admin = serviceClient();
    // Service role or an admin only: this moves money.
    await requireOperator(req, admin);

    if (!stripeConfigured()) {
      console.warn('[refund] STRIPE_SECRET_KEY is not set; nothing to do');
      return json({ ok: true, claimed: 0, refunded: 0, failed: 0, skipped: 'stripe-unconfigured' });
    }

    const { data: pendingRows, error: readError } = await admin
      .from('refunds')
      .select('id, order_id, amount_cents')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(MAX_ROWS_PER_RUN);
    if (readError) throw new Error(`reading refund queue: ${readError.message}`);

    const queued = (pendingRows ?? []) as RefundRow[];
    if (queued.length === 0) {
      return json({ ok: true, claimed: 0, refunded: 0, failed: 0 });
    }

    let refunded = 0;
    let failed = 0;
    let claimed = 0;

    for (const row of queued) {
      // Claim it. The `eq('status','pending')` is the lock: a concurrent run that
      // already claimed this row updates zero rows here and skips it.
      const { data: claimedRows, error: claimError } = await admin
        .from('refunds')
        .update({ status: 'processing' })
        .eq('id', row.id)
        .eq('status', 'pending')
        .select('id');
      if (claimError) throw new Error(`claiming refund ${row.id}: ${claimError.message}`);
      if (!claimedRows || claimedRows.length === 0) continue;
      claimed += 1;

      // Re-read the order under the service role: never trust the queued amount
      // to exceed what was actually charged.
      const { data: order, error: orderError } = await admin
        .from('orders')
        .select('id, total_cents, payment_status, stripe_payment_intent_id')
        .eq('id', row.order_id)
        .maybeSingle();

      if (orderError || !order?.stripe_payment_intent_id) {
        await markFailed(
          admin,
          row.id,
          orderError?.message ?? 'The order has no Stripe payment to refund.',
        );
        failed += 1;
        continue;
      }

      const amount = Math.min(row.amount_cents, order.total_cents as number);
      if (amount <= 0) {
        await markFailed(admin, row.id, 'Refund amount resolved to zero.');
        failed += 1;
        continue;
      }

      try {
        const refund = await stripeRequest<StripeRefund>('/v1/refunds', {
          method: 'POST',
          body: {
            payment_intent: order.stripe_payment_intent_id as string,
            amount,
            // So a Stripe-side retry cannot create a second refund.
            metadata: { order_id: row.order_id, refund_row: row.id },
          },
          idempotencyKey: `refund_${row.order_id}`,
        });

        await admin
          .from('refunds')
          .update({
            status: 'succeeded',
            stripe_refund_id: refund.id,
            processed_at: new Date().toISOString(),
            error: null,
          })
          .eq('id', row.id);

        // payment_status is settled by the charge.refunded webhook, which is the
        // only event that proves Stripe finished. Nothing is claimed here.
        refunded += 1;
        console.log(`[refund] order ${row.order_id} refunded ${amount} (${refund.id})`);
      } catch (e) {
        await markFailed(admin, row.id, (e as Error).message);
        failed += 1;
      }
    }

    return json({ ok: true, claimed, refunded, failed });
  } catch (e) {
    return errorResponse(e, (message, status) => fail(message, status));
  }
});

async function markFailed(
  admin: ReturnType<typeof serviceClient>,
  refundId: string,
  reason: string,
): Promise<void> {
  await admin
    .from('refunds')
    .update({
      status: 'failed',
      error: reason.slice(0, 500),
      processed_at: new Date().toISOString(),
    })
    .eq('id', refundId);
  console.error(`[refund] ${refundId} failed: ${reason}`);
}

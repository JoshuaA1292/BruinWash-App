import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { formatCents } from '@/constants/pricing';
import { formatPickupTime } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import type { OrderWithBuilding } from '@/types/database';
import { InfoRow } from './OrderSummary';

/**
 * Terminal state for a cancelled order. refund_cents is whatever
 * cancel_order() decided from the Terms of Service tiers.
 *
 * The wording tracks the ACTUAL state of the money. cancel_order only queues a
 * refund (public.refunds); process-refund performs it and the charge.refunded
 * webhook settles payment_status. So the copy says "on its way" until
 * payment_status confirms Stripe finished, and never claims money has landed
 * before it has. An order that was never charged shows no refund line at all.
 */
export function CancelledNotice({
  order,
  cancelledByYou,
}: {
  order: OrderWithBuilding;
  cancelledByYou: boolean;
}) {
  const refundDue = order.refund_cents > 0;
  // Stripe has confirmed it only once the webhook moved payment_status.
  const refundSettled =
    order.payment_status === 'refunded' || order.payment_status === 'partially_refunded';
  const neverCharged = order.payment_status === 'unpaid' || order.payment_status === 'processing';

  return (
    <Card style={styles.card}>
      <View style={styles.badge}>
        <Text variant="micro" color={colors.danger}>
          CANCELLED
        </Text>
      </View>

      <Text variant="title" style={styles.title}>
        This order was cancelled
      </Text>
      <Text variant="caption" color={colors.textMuted} style={styles.lede}>
        {cancelledByYou
          ? 'You cancelled this order.'
          : 'This order was cancelled by the other side, so nothing is coming.'}{' '}
        It was scheduled for {formatPickupTime(order.pickup_at)}.
      </Text>

      <View style={styles.refund}>
        <InfoRow label="Order total" value={formatCents(order.total_cents)} />
        <InfoRow
          label={refundSettled ? 'Refund issued' : refundDue ? 'Refund on its way' : 'Refund'}
          value={
            refundDue
              ? formatCents(order.refund_cents)
              : neverCharged
                ? 'Nothing was charged'
                : 'None — washing had begun'
          }
          emphasis
        />
      </View>

      {refundDue ? (
        <Text variant="micro" color={colors.textSubtle}>
          {refundSettled
            ? 'Your refund has been sent back to your original payment method. Banks usually post it within 5–10 business days.'
            : 'We are sending this back to your original payment method now. You will see it within 5–10 business days once your bank posts it.'}
        </Text>
      ) : neverCharged ? (
        <Text variant="micro" color={colors.textSubtle}>
          This order was never charged, so there is nothing to refund.
        </Text>
      ) : null}

      {order.cancellation_reason ? (
        <View style={styles.reason}>
          <Text variant="micro" color={colors.textSubtle}>
            REASON GIVEN
          </Text>
          <Text variant="caption" style={styles.reasonBody}>
            {order.cancellation_reason}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderColor: colors.danger, borderWidth: 1 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  title: { marginTop: spacing.md },
  lede: { marginTop: spacing.xs, lineHeight: 19 },
  refund: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  reason: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  reasonBody: { lineHeight: 19 },
});

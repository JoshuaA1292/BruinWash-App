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
 */
export function CancelledNotice({
  order,
  cancelledByYou,
}: {
  order: OrderWithBuilding;
  cancelledByYou: boolean;
}) {
  const refunded = order.refund_cents > 0;

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
          label={refunded ? 'Refund applied' : 'Refund'}
          value={refunded ? formatCents(order.refund_cents) : 'None — washing had begun'}
          emphasis
        />
      </View>

      {refunded ? (
        <Text variant="micro" color={colors.textSubtle}>
          Refunds land back on your original payment method, usually within 5–10 business days.
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

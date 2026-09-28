import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Text } from '@/components/ui';
import { formatCents, TIERS } from '@/constants/pricing';
import { StatusPill } from '@/features/requester/StatusPill';
import { formatPickupTime } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import type { OrderWithBuilding, PaymentStatus } from '@/types/database';

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  processing: 'Processing',
  paid: 'Paid',
  refunded: 'Refunded',
  partially_refunded: 'Part refund',
  failed: 'Payment failed',
};

function paymentTone(status: PaymentStatus): { bg: string; fg: string } {
  if (status === 'paid') return { bg: colors.successSurface, fg: colors.success };
  if (status === 'failed') return { bg: colors.dangerSurface, fg: colors.danger };
  if (status === 'refunded' || status === 'partially_refunded') {
    return { bg: colors.warningSurface, fg: colors.warning };
  }
  return { bg: colors.surfaceAlt, fg: colors.textMuted };
}

/** One order on the admin dashboard. Tapping it opens the order detail screen. */
export function AdminOrderRow({ order }: { order: OrderWithBuilding }) {
  const tier = TIERS.find((t) => t.id === order.tier);
  const payment = paymentTone(order.payment_status);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open order ${order.id.slice(0, 8)} at ${
        order.buildings?.name ?? 'unknown building'
      }, ${formatCents(order.total_cents)}`}
      onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      <Card style={styles.card}>
        <View style={styles.headRow}>
          <StatusPill status={order.status} />
          <View style={[styles.payment, { backgroundColor: payment.bg }]}>
            <Text variant="micro" color={payment.fg}>
              {PAYMENT_LABELS[order.payment_status].toUpperCase()}
            </Text>
          </View>
          <View style={styles.spacer} />
          <Text variant="bodyStrong" color={colors.text}>
            {formatCents(order.total_cents)}
          </Text>
        </View>

        <Text variant="bodyStrong" color={colors.text}>
          {order.buildings?.name ?? 'Unknown building'} · Floor {order.floor}
        </Text>
        <Text variant="caption" color={colors.textMuted}>
          {tier?.name ?? order.tier}
          {order.load_count > 1 ? ` · ${order.load_count} loads` : ''} ·{' '}
          {formatPickupTime(order.pickup_at)}
        </Text>
        <Text variant="micro" color={colors.textSubtle}>
          #{order.id.slice(0, 8)}
          {order.washer_id ? ' · claimed' : ' · unclaimed'}
        </Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  pressed: { opacity: 0.9 },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  spacer: { flex: 1 },
  payment: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
});

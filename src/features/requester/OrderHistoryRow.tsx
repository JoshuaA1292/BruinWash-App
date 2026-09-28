import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Text } from '@/components/ui';
import { formatCents, TIERS } from '@/constants/pricing';
import { formatPickupTime } from '@/lib/format';
import { colors, spacing } from '@/theme';
import type { MyOrder } from '@/hooks/useMyOrders';
import { StatusPill } from './StatusPill';

/** One row in the requester's order history, with its follow-up actions. */
export function OrderHistoryRow({ order }: { order: MyOrder }) {
  const tier = TIERS.find((t) => t.id === order.tier);
  const needsRating = order.status === 'delivered' && !order.reviewed && Boolean(order.washer_id);

  return (
    <Card style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${tier?.name ?? order.tier} order at ${
          order.buildings?.name ?? 'your building'
        }, ${formatPickupTime(order.pickup_at)}, ${formatCents(order.total_cents)}`}
        onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        <View style={styles.headRow}>
          <StatusPill status={order.status} />
          <Text variant="bodyStrong" color={colors.text}>
            {formatCents(order.total_cents)}
          </Text>
        </View>

        <Text variant="bodyStrong" color={colors.text}>
          {tier?.name ?? order.tier}
          {order.load_count > 1 ? ` · ${order.load_count} loads` : ''}
        </Text>
        <Text variant="caption" color={colors.textMuted}>
          {order.buildings?.name ?? 'Your building'} · Floor {order.floor}
        </Text>
        <Text variant="caption" color={colors.textMuted}>
          {formatPickupTime(order.pickup_at)}
        </Text>
      </Pressable>

      <View style={styles.actions}>
        {needsRating ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Rate your washer for this order"
            onPress={() => router.push({ pathname: '/order/[id]/rate', params: { id: order.id } })}
            hitSlop={8}
          >
            <Text variant="label" color={colors.primary}>
              Rate your washer
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Report an issue with this order"
          onPress={() => router.push({ pathname: '/dispute/[id]', params: { id: order.id } })}
          hitSlop={8}
        >
          <Text variant="label" color={colors.textMuted}>
            Report an issue
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  main: { gap: spacing.xs },
  pressed: { opacity: 0.85 },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
});

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Stars, Text } from '@/components/ui';
import { formatCents, TIERS } from '@/constants/pricing';
import { formatPickupTime, formatRating } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import type { MyOrder } from '@/hooks/useMyOrders';
import { StatusPill, statusBlurb } from './StatusPill';

/**
 * The live order card on Home. The washer's name comes from the washer_cards
 * view, which is first-name-only by design.
 */
export function ActiveOrderCard({ order }: { order: MyOrder }) {
  const tier = TIERS.find((t) => t.id === order.tier);
  const washerName = order.washer?.first_name ?? null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open your ${tier?.name ?? order.tier} order, ${statusBlurb(order.status)}`}
      onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      <Card style={styles.card}>
        <View style={styles.headRow}>
          <StatusPill status={order.status} />
          <Text variant="bodyStrong" color={colors.text}>
            {formatCents(order.total_cents)}
          </Text>
        </View>

        <Text variant="heading" color={colors.text}>
          {statusBlurb(order.status)}
        </Text>

        <View style={styles.metaRow}>
          <Text variant="caption" color={colors.textMuted}>
            {order.buildings?.name ?? 'Your building'} · Floor {order.floor}
          </Text>
          <Text variant="caption" color={colors.textMuted}>
            {formatPickupTime(order.pickup_at)}
          </Text>
        </View>

        {washerName ? (
          <View style={styles.washerRow}>
            <View style={styles.avatar}>
              <Text variant="bodyStrong" color={colors.primaryDark}>
                {washerName.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={styles.washerText}>
              <Text variant="label" color={colors.text}>
                {washerName} is your washer
              </Text>
              <View style={styles.ratingRow}>
                <Stars rating={order.washer?.avg_rating ?? 0} size={13} />
                <Text variant="caption" color={colors.textMuted}>
                  {formatRating(order.washer?.avg_rating ?? 0)}
                  {order.washer && order.washer.review_count > 0
                    ? ` · ${order.washer.review_count} reviews`
                    : ''}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <Text variant="caption" color={colors.textMuted}>
            We will let you know the moment a washer in your building claims it.
          </Text>
        )}

        <Text variant="caption" color={colors.primary}>
          View order details ›
        </Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  pressed: { opacity: 0.9 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaRow: { gap: spacing.xs },
  washerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  washerText: { flex: 1, gap: spacing.xs },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});

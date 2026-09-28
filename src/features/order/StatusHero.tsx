import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { ORDER_STAGES } from '@/constants/copy';
import { formatPickupTime } from '@/lib/format';
import { colors, radius, shadow, spacing } from '@/theme';
import type { OrderWithBuilding } from '@/types/database';
import { stageIndex } from './stages';

interface Props {
  order: OrderWithBuilding;
  awaitingPayment: boolean;
  paymentFailed: boolean;
  /** True while the realtime channel is subscribed. */
  live: boolean;
}

/** The glanceable navy banner at the top of the order screen. */
export function StatusHero({ order, awaitingPayment, paymentFailed, live }: Props) {
  const index = stageIndex(order.status);
  const stage = index >= 0 ? ORDER_STAGES[index] : undefined;

  let eyebrow: string = `STAGE ${index + 1} OF ${ORDER_STAGES.length}`;
  let headline: string = stage?.label ?? 'Pending';
  let blurb: string = stage?.blurb ?? 'Finding a washer in your building';

  if (paymentFailed) {
    eyebrow = 'PAYMENT PROBLEM';
    headline = 'Payment failed';
    blurb = 'We could not charge your card, so no washer has been notified yet.';
  } else if (awaitingPayment) {
    eyebrow = 'ALMOST THERE';
    headline = 'Confirming your payment…';
    blurb = 'As soon as the charge clears we start looking for a washer in your building.';
  } else if (order.status === 'out_for_delivery') {
    blurb = 'On the way back to you — meet them at the end of the hall.';
  }

  return (
    <View style={styles.hero} accessible accessibilityLabel={`${headline}. ${blurb}`}>
      <View style={styles.topRow}>
        <Text variant="micro" color={colors.primarySoft}>
          {eyebrow}
        </Text>
        {live ? (
          <View style={styles.liveChip}>
            <View style={styles.liveDot} />
            <Text variant="micro" color={colors.textOnPrimary}>
              LIVE
            </Text>
          </View>
        ) : null}
      </View>

      <Text variant="display" color={colors.textOnPrimary} style={styles.headline}>
        {headline}
      </Text>
      <Text variant="body" color={colors.primarySoft} style={styles.blurb}>
        {blurb}
      </Text>

      <View style={styles.footRow}>
        <Text variant="caption" color={colors.primarySoft}>
          {order.buildings?.name ?? 'Your building'} · {formatPickupTime(order.pickup_at)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.xs,
    ...shadow.card,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryDark,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.successSurface,
  },
  headline: { marginTop: spacing.sm },
  blurb: { marginTop: spacing.xs, lineHeight: 22 },
  footRow: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.primaryLight,
  },
});

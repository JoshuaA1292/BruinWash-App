import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { formatCents } from '@/constants/pricing';
import { formatPickupTime } from '@/lib/format';
import { colors, spacing } from '@/theme';
import type { OrderWithBuilding } from '@/types/database';
import { Pill } from './Pieces';
import { loadsLabel, tierName } from './jobText';
import { estimateWasherPayoutCents } from './payout';

/** A finished (delivered or cancelled) job. */
export function HistoryCard({ order }: { order: OrderWithBuilding }) {
  const delivered = order.status === 'delivered';

  return (
    <Card elevated={false}>
      <View style={styles.row}>
        <View style={styles.left}>
          <Text variant="bodyStrong" color={colors.text}>
            {order.buildings?.name ?? 'Your building'}
          </Text>
          <Text variant="caption" color={colors.textMuted}>
            {formatPickupTime(order.delivered_at ?? order.pickup_at)}
          </Text>
          <Text variant="micro" color={colors.textSubtle}>
            {`${tierName(order.tier)} · ${loadsLabel(order.load_count)}`}
          </Text>
        </View>
        <View style={styles.right}>
          <Pill label={delivered ? 'Delivered' : 'Cancelled'} tone={delivered ? 'success' : 'neutral'} />
          {delivered ? (
            <Text variant="bodyStrong" color={colors.text}>
              {formatCents(estimateWasherPayoutCents(order))}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  left: { flexShrink: 1, gap: spacing.xs },
  right: { alignItems: 'flex-end', gap: spacing.xs },
});

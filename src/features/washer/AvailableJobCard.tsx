import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Text } from '@/components/ui';
import { formatCents } from '@/constants/pricing';
import { formatPickupTime } from '@/lib/format';
import { colors, spacing } from '@/theme';
import type { AvailableOrder } from '@/types/database';
import { DetailRow, Pill } from './Pieces';
import { addonsLabel, floorLabel, loadsLabel, tierName, washSettingsLabel } from './jobText';
import { estimateWasherPayoutCents } from './payout';

/**
 * An unclaimed pending job. Deliberately shows nothing about who booked it —
 * one-way visibility means the washer sees the building, the floor and the
 * laundry, never the requester.
 */
export function AvailableJobCard({
  order,
  onAccept,
  accepting,
  disabled,
}: {
  order: AvailableOrder;
  onAccept: () => void;
  accepting: boolean;
  disabled?: boolean;
}) {
  const earns = formatCents(estimateWasherPayoutCents(order));
  const addons = addonsLabel(order);

  return (
    <Card>
      <View style={styles.header}>
        <Text variant="heading" color={colors.text} style={styles.title}>
          {order.building_name}
        </Text>
        <Pill label={tierName(order.tier)} />
      </View>

      <View style={styles.details}>
        <DetailRow label="Pickup" value={formatPickupTime(order.pickup_at)} />
        <DetailRow label="Where" value={floorLabel(order.floor)} />
        <DetailRow label="Laundry" value={loadsLabel(order.load_count)} />
        <DetailRow label="Settings" value={washSettingsLabel(order)} />
        {addons ? <DetailRow label="Add-ons" value={addons} /> : null}
      </View>

      <View style={styles.earnRow}>
        <Text variant="label" color={colors.textMuted}>
          You earn
        </Text>
        <Text variant="heading" color={colors.primary}>
          {earns}
        </Text>
      </View>

      <Button
        label="Accept job"
        trailing={earns}
        onPress={onAccept}
        loading={accepting}
        disabled={disabled}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: { flexShrink: 1 },
  details: { gap: spacing.sm, marginTop: spacing.md },
  earnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});

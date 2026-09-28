import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { formatPickupTime } from '@/lib/format';
import { colors, spacing } from '@/theme';
import type { CheckoutBooking } from './params';

interface Props {
  booking: CheckoutBooking;
}

/** A read-only recap of what the Schedule screen collected. */
export function PickupRecap({ booking }: Props) {
  const where = [booking.buildingName ?? 'Your building', `Floor ${booking.floor}`]
    .concat(booking.roomNumber ? [`Room ${booking.roomNumber}`] : [])
    .join(' · ');

  return (
    <Card>
      <View style={styles.stack}>
        <Text variant="heading">Pickup</Text>
        <Row label="When" value={booking.pickupAt ? formatPickupTime(booking.pickupAt) : 'Not set'} />
        <Row label="Where" value={where} />
        {booking.notes ? <Row label="Notes" value={booking.notes} /> : null}
      </View>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row} accessible accessibilityRole="text" accessibilityLabel={`${label}: ${value}`}>
      <Text variant="caption" color={colors.textMuted} style={styles.rowLabel}>
        {label}
      </Text>
      <Text variant="body" style={styles.rowValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  rowLabel: { width: 56, paddingTop: 3 },
  rowValue: { flex: 1 },
});

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { PRICING_BREAKDOWN_NOTE } from '@/constants/copy';
import { TIERS, formatCents } from '@/constants/pricing';
import { formatPickupTime } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import type { OrderWithBuilding, PaymentStatus } from '@/types/database';

export function InfoRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant={emphasis ? 'bodyStrong' : 'body'} color={colors.textMuted} style={styles.rowLabel}>
        {label}
      </Text>
      <Text variant={emphasis ? 'bodyStrong' : 'body'} style={styles.rowValue}>
        {value}
      </Text>
    </View>
  );
}

function tierName(tier: OrderWithBuilding['tier']): string {
  return TIERS.find((t) => t.id === tier)?.name ?? tier;
}

/** Pickup location, time, and what was ordered. */
export function OrderDetailsCard({ order }: { order: OrderWithBuilding }) {
  const addons = [
    order.add_detergent_pods ? 'Detergent pods' : null,
    order.add_gloves ? 'Gloves' : null,
  ].filter((a): a is string => a !== null);

  const room = [order.floor ? `Floor ${order.floor}` : null, order.room_number]
    .filter((p): p is string => Boolean(p))
    .join(' · ');

  return (
    <Card>
      <Text variant="heading">Pickup details</Text>
      <View style={styles.list}>
        <InfoRow label="Building" value={order.buildings?.name ?? 'Your building'} />
        {room ? <InfoRow label="Where" value={room} /> : null}
        <InfoRow label="Scheduled" value={formatPickupTime(order.pickup_at)} />
        <InfoRow label="Service" value={tierName(order.tier)} />
        <InfoRow
          label="Loads"
          value={`${order.load_count} ${order.load_count === 1 ? 'load' : 'loads'}`}
        />
        <InfoRow
          label="Settings"
          value={`${order.wash_cycle} • ${order.wash_temp} • ${order.dry_level}`}
        />
        {addons.length > 0 ? <InfoRow label="Add-ons" value={addons.join(', ')} /> : null}
      </View>

      {order.notes ? (
        <View style={styles.notes}>
          <Text variant="micro" color={colors.textSubtle}>
            NOTES FOR YOUR WASHER
          </Text>
          <Text variant="caption" style={styles.notesBody}>
            {order.notes}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'Not charged yet',
  processing: 'Confirming…',
  paid: 'Paid',
  refunded: 'Refunded',
  partially_refunded: 'Partially refunded',
  failed: 'Payment failed',
};

/**
 * The stored, server-priced breakdown. Every figure here was written by
 * price_order()/create_order() — nothing is recomputed on the device.
 */
export function OrderTotalsCard({ order }: { order: OrderWithBuilding }) {
  return (
    <Card>
      <Text variant="heading">What you paid</Text>
      <View style={styles.list}>
        <InfoRow label="Service fee" value={formatCents(order.service_fee_cents)} />
        <InfoRow label="Machine cost" value={formatCents(order.machine_cost_cents)} />
        {order.addons_cents > 0 ? (
          <InfoRow label="Add-ons" value={formatCents(order.addons_cents)} />
        ) : null}
        {order.discount_cents > 0 ? (
          <InfoRow
            label={order.promo_code ? `Discount (${order.promo_code})` : 'Discount'}
            value={`-${formatCents(order.discount_cents)}`}
          />
        ) : null}
        {order.tip_cents > 0 ? <InfoRow label="Tip" value={formatCents(order.tip_cents)} /> : null}
        <InfoRow label="Processing" value={formatCents(order.processing_fee_cents)} />
      </View>

      <View style={styles.divider} />
      <InfoRow label="Total" value={formatCents(order.total_cents)} emphasis />
      <View style={styles.paymentRow}>
        <Text variant="micro" color={colors.textSubtle}>
          {PAYMENT_LABEL[order.payment_status].toUpperCase()}
        </Text>
      </View>

      <Text variant="caption" color={colors.textMuted} style={styles.note}>
        {PRICING_BREAKDOWN_NOTE}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  rowLabel: { flexShrink: 0 },
  rowValue: { flex: 1, textAlign: 'right' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  paymentRow: { marginTop: spacing.xs, alignItems: 'flex-end' },
  note: { marginTop: spacing.md, lineHeight: 18 },
  notes: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  notesBody: { lineHeight: 19 },
});

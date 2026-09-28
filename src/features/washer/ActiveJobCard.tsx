import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Text } from '@/components/ui';
import { formatCents } from '@/constants/pricing';
import { formatPickupTime } from '@/lib/format';
import { colors, spacing } from '@/theme';
import type { OrderWithBuilding } from '@/types/database';
import { DetailRow, Pill } from './Pieces';
import { addonsLabel, floorLabel, loadsLabel, tierName, washSettingsLabel } from './jobText';
import { estimateWasherPayoutCents } from './payout';
import { nextStage, stageBlurb, stageLabel, type AdvanceTarget } from './stages';

/**
 * One assigned, in-flight job. The stage controls map 1:1 onto the RPCs:
 * set_washer_en_route() for "I'm on my way" (a notification, not a stage), then
 * advance_order_status() for the single legal next stage.
 */
export function ActiveJobCard({
  order,
  busyLabel,
  busy,
  onEnRoute,
  onAdvance,
  onDeliver,
  onOpenChat,
  proofReady,
}: {
  order: OrderWithBuilding;
  busy: boolean;
  busyLabel: string | null;
  onEnRoute: () => void;
  onAdvance: (to: AdvanceTarget) => void;
  onDeliver: () => void;
  onOpenChat: () => void;
  proofReady: boolean;
}) {
  const stage = nextStage(order.status);
  const addons = addonsLabel(order);
  const canGoEnRoute = order.status === 'accepted' && !order.en_route_at;

  return (
    <Card>
      <View style={styles.header}>
        <Text variant="heading" color={colors.text} style={styles.title}>
          {order.buildings?.name ?? 'Your building'}
        </Text>
        <Pill label={stageLabel(order.status)} />
      </View>
      <Text variant="caption" color={colors.textMuted}>
        {stageBlurb(order.status)}
      </Text>

      <View style={styles.details}>
        <DetailRow label="Pickup" value={formatPickupTime(order.pickup_at)} />
        <DetailRow label="Where" value={floorLabel(order.floor)} />
        <DetailRow label="Laundry" value={`${tierName(order.tier)} · ${loadsLabel(order.load_count)}`} />
        <DetailRow label="Settings" value={washSettingsLabel(order)} />
        {addons ? <DetailRow label="Add-ons" value={addons} /> : null}
        <DetailRow label="Your payout" value={formatCents(estimateWasherPayoutCents(order))} />
      </View>

      {order.notes ? (
        <View style={styles.notes}>
          <Text variant="micro" color={colors.textMuted}>
            REQUEST NOTES
          </Text>
          <Text variant="caption" color={colors.text}>
            {order.notes}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {canGoEnRoute ? (
          <Button label="I'm on my way" variant="secondary" onPress={onEnRoute} disabled={busy} />
        ) : null}

        {order.status === 'accepted' && order.en_route_at ? (
          <Text variant="caption" color={colors.success}>
            They know you are on the way.
          </Text>
        ) : null}

        {stage?.requiresPhoto ? (
          <Text variant="caption" color={colors.textMuted}>
            {proofReady
              ? 'Photo uploaded — tap again to finish closing this job out.'
              : 'A photo of the drop-off is required to mark this delivered.'}
          </Text>
        ) : null}

        {stage ? (
          <Button
            label={proofReady && stage.requiresPhoto ? 'Finish delivery' : stage.label}
            onPress={() => (stage.requiresPhoto ? onDeliver() : onAdvance(stage.to))}
            loading={busy}
          />
        ) : null}

        <Button label="Message requester" variant="ghost" onPress={onOpenChat} disabled={busy} />

        {busy && busyLabel ? (
          <Text variant="caption" color={colors.textMuted} center>
            {busyLabel}
          </Text>
        ) : null}
      </View>
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
  notes: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: spacing.md,
    backgroundColor: colors.surfaceAlt,
    gap: spacing.xs,
  },
  actions: { marginTop: spacing.lg, gap: spacing.sm },
});

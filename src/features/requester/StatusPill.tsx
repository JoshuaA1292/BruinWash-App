import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { ORDER_STAGES } from '@/constants/copy';
import { colors, radius, spacing } from '@/theme';
import type { OrderStatus } from '@/types/database';

/**
 * The status chip used by the requester screens and the admin dashboard.
 * Labels come from ORDER_STAGES so they match the live web product exactly.
 */

const STAGE_LABELS: Record<string, string> = ORDER_STAGES.reduce<Record<string, string>>(
  (acc, stage) => ({ ...acc, [stage.status]: stage.label }),
  {},
);

const STAGE_BLURBS: Record<string, string> = ORDER_STAGES.reduce<Record<string, string>>(
  (acc, stage) => ({ ...acc, [stage.status]: stage.blurb }),
  {},
);

export function statusLabel(status: OrderStatus): string {
  return status === 'cancelled' ? 'Cancelled' : STAGE_LABELS[status] ?? status;
}

export function statusBlurb(status: OrderStatus): string {
  return status === 'cancelled' ? 'This order was cancelled' : STAGE_BLURBS[status] ?? '';
}

type Tone = { bg: string; fg: string };

function toneFor(status: OrderStatus): Tone {
  if (status === 'delivered') return { bg: colors.successSurface, fg: colors.success };
  if (status === 'cancelled') return { bg: colors.dangerSurface, fg: colors.danger };
  if (status === 'pending') return { bg: colors.warningSurface, fg: colors.warning };
  return { bg: colors.primarySoft, fg: colors.primaryDark };
}

export function StatusPill({ status }: { status: OrderStatus }) {
  const tone = toneFor(status);
  const label = statusLabel(status);
  return (
    <View
      style={[styles.pill, { backgroundColor: tone.bg }]}
      accessibilityRole="text"
      accessibilityLabel={`Status: ${label}`}
    >
      <Text variant="micro" color={tone.fg}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
});

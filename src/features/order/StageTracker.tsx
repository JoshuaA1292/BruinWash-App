import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { ORDER_STAGES } from '@/constants/copy';
import { formatRelative } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import type { Order } from '@/types/database';
import { stageIndex, stageTimestamp, type StageState } from './stages';

interface Props {
  order: Order;
  /** Before Stripe confirms, nothing is "current" — the hero explains instead. */
  awaitingPayment?: boolean;
}

const LAST = ORDER_STAGES.length - 1;

/** Vertical done / current / upcoming rail for the 6-stage pipeline (spec 2.5). */
export function StageTracker({ order, awaitingPayment = false }: Props) {
  const current = stageIndex(order.status);
  const currentStage = current >= 0 ? ORDER_STAGES[current] : undefined;

  return (
    <View
      style={styles.wrap}
      accessibilityRole="progressbar"
      accessibilityLabel="Order progress"
      accessibilityValue={{
        min: 1,
        max: ORDER_STAGES.length,
        now: Math.max(current + 1, 1),
        text: awaitingPayment
          ? 'Waiting on payment confirmation'
          : `Stage ${Math.max(current + 1, 1)} of ${ORDER_STAGES.length}: ${currentStage?.label ?? 'Pending'}`,
      }}
    >
      {ORDER_STAGES.map((stage, i) => {
        const state: StageState = awaitingPayment
          ? 'upcoming'
          : i < current
            ? 'done'
            : i === current
              ? 'current'
              : 'upcoming';

        const at = state === 'upcoming' ? null : stageTimestamp(order, stage.status);

        return (
          <View key={stage.status} style={styles.row}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.connector,
                  styles.connectorTop,
                  i === 0 && styles.connectorHidden,
                  !awaitingPayment && i <= current && styles.connectorDone,
                ]}
              />
              <Dot state={state} />
              <View
                style={[
                  styles.connector,
                  styles.connectorBottom,
                  i === LAST && styles.connectorHidden,
                  !awaitingPayment && i < current && styles.connectorDone,
                ]}
              />
            </View>

            <View style={[styles.body, state === 'current' && styles.bodyCurrent]}>
              <Text
                variant={state === 'current' ? 'heading' : 'bodyStrong'}
                color={
                  state === 'current'
                    ? colors.primaryDark
                    : state === 'done'
                      ? colors.text
                      : colors.textSubtle
                }
              >
                {stage.label}
              </Text>

              {state === 'current' ? (
                <Text variant="caption" color={colors.textMuted} style={styles.blurb}>
                  {stage.blurb}
                </Text>
              ) : null}

              {at ? (
                <Text variant="micro" color={colors.textSubtle}>
                  {formatRelative(at)}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Dot({ state }: { state: StageState }) {
  if (state === 'current') {
    return (
      <View style={styles.dotRing}>
        <View style={styles.dotCurrent} />
      </View>
    );
  }
  if (state === 'done') {
    return (
      <View style={styles.dotDone}>
        <Text variant="micro" color={colors.textOnPrimary}>
          ✓
        </Text>
      </View>
    );
  }
  return <View style={styles.dotUpcoming} />;
}

const RAIL = 32;

const styles = StyleSheet.create({
  wrap: { gap: 0 },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  rail: { width: RAIL, alignItems: 'center' },
  connector: {
    width: 2,
    backgroundColor: colors.border,
  },
  connectorTop: { height: spacing.sm },
  connectorBottom: { flex: 1, minHeight: spacing.sm },
  connectorDone: { backgroundColor: colors.primary },
  connectorHidden: { backgroundColor: 'transparent' },
  dotRing: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotCurrent: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  dotDone: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotUpcoming: {
    width: 14,
    height: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.borderStrong,
  },
  body: {
    flex: 1,
    paddingBottom: spacing.lg,
    paddingLeft: spacing.md,
    gap: spacing.xs / 2,
  },
  bodyCurrent: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingRight: spacing.md,
    marginBottom: spacing.lg,
    paddingBottom: spacing.sm,
  },
  blurb: { lineHeight: 18 },
});

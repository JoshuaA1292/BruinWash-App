import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

/** Small status / tier chip. */
export function Pill({
  label,
  tone = 'brand',
}: {
  label: string;
  tone?: 'brand' | 'neutral' | 'success' | 'danger';
}) {
  const palette = {
    brand: { bg: colors.primarySoft, fg: colors.primaryDark },
    neutral: { bg: colors.surfaceAlt, fg: colors.textMuted },
    success: { bg: colors.successSurface, fg: colors.success },
    danger: { bg: colors.dangerSurface, fg: colors.danger },
  }[tone];

  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <Text variant="micro" color={palette.fg}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

/** Label on the left, value on the right — the web app's detail row. */
export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="caption" color={colors.textMuted}>
        {label}
      </Text>
      <Text variant="caption" color={colors.text} style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

/** A headline figure, used by the earnings dashboard. */
export function StatTile({
  label,
  value,
  caption,
  emphasis,
}: {
  label: string;
  value: string;
  caption?: string;
  emphasis?: boolean;
}) {
  return (
    <Card
      style={[styles.tile, emphasis && styles.tileEmphasis]}
      elevated={false}
    >
      <Text variant="caption" color={emphasis ? colors.primaryDark : colors.textMuted}>
        {label}
      </Text>
      <Text variant="title" color={emphasis ? colors.primary : colors.text}>
        {value}
      </Text>
      {caption ? (
        <Text variant="micro" color={colors.textSubtle}>
          {caption}
        </Text>
      ) : null}
    </Card>
  );
}

/** Centred empty state with the product's own wording. */
export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.empty}>
      <Text variant="heading" color={colors.text} center>
        {title}
      </Text>
      <Text variant="caption" color={colors.textMuted} center>
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  detailValue: { flexShrink: 1, textAlign: 'right' },
  tile: {
    flex: 1,
    minWidth: 140,
    gap: spacing.xs,
    backgroundColor: colors.surface,
  },
  tileEmphasis: { backgroundColor: colors.primarySoft, borderColor: colors.primaryLight },
  empty: {
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
});

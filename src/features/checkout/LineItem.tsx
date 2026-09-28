import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { colors, spacing } from '@/theme';

interface Props {
  label: string;
  /** Per-load maths or the wash settings string, shown under the label. */
  sublabel?: string | null;
  value?: string | null;
  /** The Total row. */
  emphasis?: boolean;
  /** A discount, drawn in the success colour. */
  credit?: boolean;
}

export function LineItem({ label, sublabel, value, emphasis, credit }: Props) {
  const valueColor = credit ? colors.success : colors.text;
  const variant = emphasis ? 'bodyStrong' : 'body';

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="text"
      accessibilityLabel={value ? `${label}, ${value}` : label}
    >
      <View style={styles.labelCol}>
        <Text variant={variant}>{label}</Text>
        {sublabel ? (
          <Text variant="caption" color={colors.textMuted}>
            {sublabel}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant={emphasis ? 'heading' : 'bodyStrong'} color={valueColor}>
          {value}
        </Text>
      ) : null}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  labelCol: { flex: 1, gap: 2 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
});

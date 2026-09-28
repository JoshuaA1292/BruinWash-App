import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { colors, spacing } from '@/theme';

/** One number on the admin dashboard header. */
export function SummaryTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card style={styles.tile}>
      <View accessible accessibilityRole="text" accessibilityLabel={`${label}: ${value}`} style={styles.inner}>
        <Text variant="micro" color={colors.textMuted}>
          {label.toUpperCase()}
        </Text>
        <Text variant="title" color={colors.primary}>
          {value}
        </Text>
        {hint ? (
          <Text variant="micro" color={colors.textSubtle}>
            {hint}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, minWidth: 140, padding: spacing.md },
  inner: { gap: spacing.xs },
});

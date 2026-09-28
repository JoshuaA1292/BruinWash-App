import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { colors, spacing } from '@/theme';

interface Props {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

/** One of the two labelled panels on the booking form: Pickup / Laundry details. */
export function Section({ title, subtitle, children }: Props) {
  return (
    <Card>
      <View style={styles.header}>
        <Text variant="heading">{title}</Text>
        {subtitle ? (
          <Text variant="caption" color={colors.textMuted}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.body}>{children}</View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs, marginBottom: spacing.lg },
  body: { gap: spacing.lg },
});

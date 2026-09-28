import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { colors, spacing } from '@/theme';

interface Props {
  emoji: string;
  title: string;
  body: string;
}

/** Shared empty state for the inbox feed and an unopened chat thread. */
export function MessagingEmpty({ emoji, title, body }: Props) {
  return (
    <View style={styles.wrap} accessibilityRole="summary" accessibilityLabel={`${title}. ${body}`}>
      <Text variant="display">{emoji}</Text>
      <Text variant="heading" center>
        {title}
      </Text>
      <Text variant="caption" color={colors.textMuted} center style={styles.body}>
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  body: { lineHeight: 19, maxWidth: 280 },
});

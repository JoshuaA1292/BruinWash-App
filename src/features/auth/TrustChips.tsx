import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

/**
 * The live site's safety bullets, shown as small chips so the unauthenticated
 * landing screen carries the same trust signals as the web product.
 */
export function TrustChips({ notes }: { notes: readonly string[] }) {
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`How CampusWash keeps students safe. ${notes.join('. ')}`}
    >
      {notes.map((note) => (
        <View key={note} style={styles.chip}>
          <Text variant="micro" color={colors.primaryDark} style={styles.chipText}>
            {note}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chipText: { lineHeight: 15 },
});

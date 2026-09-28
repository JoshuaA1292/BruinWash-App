import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

interface Props {
  title: string;
  subtitle?: string | null;
  onClose: () => void;
  closeLabel?: string;
}

/**
 * Sheet chrome for the checkout modal: a grabber and a close affordance, so the
 * route reads as a bottom sheet rather than a pushed screen. Spec 2.4 is explicit
 * that mobile checkout never leaves the app for a browser.
 */
export function SheetHeader({ title, subtitle, onClose, closeLabel = 'Close checkout' }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.grabber} />
      <View style={styles.row}>
        <View style={styles.titleCol}>
          <Text variant="title">{title}</Text>
          {subtitle ? (
            <Text variant="caption" color={colors.textMuted}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          hitSlop={spacing.md}
          style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
        >
          <Text variant="bodyStrong" color={colors.primary}>
            Close
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  titleCol: { flex: 1, gap: 2 },
  close: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  closePressed: { opacity: 0.6 },
});

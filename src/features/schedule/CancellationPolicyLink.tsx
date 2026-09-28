import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Button, Text } from '@/components/ui';
import { CANCELLATION_POLICY } from '@/constants/copy';
import { colors, radius, shadow, spacing } from '@/theme';

/** The "Cancellation Policy" link at the foot of the booking form (spec 2.3). */
export function CancellationPolicyLink() {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Read the cancellation policy"
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <Text variant="label" color={colors.primary} center>
          Cancellation Policy
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close cancellation policy"
            style={styles.backdropFill}
            onPress={() => setOpen(false)}
          />
          <View style={styles.sheet}>
            <Text variant="heading">Cancellation Policy</Text>
            {CANCELLATION_POLICY.map((line) => (
              <View key={line} style={styles.bulletRow}>
                <Text variant="caption" color={colors.primary} style={styles.dot}>
                  •
                </Text>
                <Text variant="caption" color={colors.text} style={styles.bulletText}>
                  {line}
                </Text>
              </View>
            ))}
            <Button label="Got it" variant="secondary" onPress={() => setOpen(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.sm },
  pressed: { opacity: 0.6 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  backdropFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
    ...shadow.sheet,
  },
  bulletRow: { flexDirection: 'row', gap: spacing.sm },
  dot: { lineHeight: 19 },
  bulletText: { flex: 1, lineHeight: 19 },
});

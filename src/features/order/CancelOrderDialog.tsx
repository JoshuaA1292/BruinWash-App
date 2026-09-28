import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner, Button, Text } from '@/components/ui';
import { CANCELLATION_POLICY } from '@/constants/copy';
import { colors, radius, shadow, spacing } from '@/theme';
import type { OrderStatus } from '@/types/database';
import { refundPolicyIndex } from './stages';

interface Props {
  visible: boolean;
  status: OrderStatus;
  pickupAt: string;
  submitting?: boolean;
  errorMessage?: string | null;
  onDismiss: () => void;
  onConfirm: () => void;
}

/**
 * Warns with the Terms of Service refund tiers before calling cancel_order().
 * The highlighted bullet is the one the server will apply — but the refund
 * figure itself is computed server-side, never here.
 */
export function CancelOrderDialog({
  visible,
  status,
  pickupAt,
  submitting = false,
  errorMessage,
  onDismiss,
  onConfirm,
}: Props) {
  const insets = useSafeAreaInsets();
  const applicable = refundPolicyIndex(status, pickupAt);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        <Pressable
          style={styles.backdropFill}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss cancellation options"
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={styles.grabber} />
          <Text variant="title">Cancel this order?</Text>
          <Text variant="caption" color={colors.textMuted} style={styles.lede}>
            Your refund depends on how far along the order is. Here is our cancellation policy —
            the highlighted line is the one that applies right now.
          </Text>

          <View style={styles.policy}>
            {CANCELLATION_POLICY.map((line, i) => {
              const active = i === applicable;
              return (
                <View
                  key={line}
                  style={[styles.policyRow, active && styles.policyRowActive]}
                  accessible
                  accessibilityLabel={active ? `Applies to your order: ${line}` : line}
                >
                  <Text
                    variant={active ? 'bodyStrong' : 'caption'}
                    color={active ? colors.warning : colors.textMuted}
                    style={styles.policyText}
                  >
                    {line}
                  </Text>
                </View>
              );
            })}
          </View>

          {errorMessage ? <Banner tone="danger" title="Could not cancel" message={errorMessage} /> : null}

          <View style={styles.actions}>
            <Button
              label="Cancel my order"
              variant="danger"
              loading={submitting}
              onPress={onConfirm}
            />
            <Button label="Keep my order" variant="ghost" onPress={onDismiss} disabled={submitting} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  backdropFill: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
    ...shadow.sheet,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.sm,
  },
  lede: { lineHeight: 19 },
  policy: { gap: spacing.xs },
  policyRow: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  policyRowActive: {
    backgroundColor: colors.warningSurface,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  policyText: { lineHeight: 19 },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
});

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Banner, Button, Card, Field, Text } from '@/components/ui';
import { formatCents } from '@/constants/pricing';
import { colors, spacing } from '@/theme';

interface Props {
  code: string;
  onChangeCode: (next: string) => void;
  onApply: () => void;
  onRemove: () => void;
  applying: boolean;
  /** The code the server accepted, if any. */
  appliedCode: string | null;
  appliedDiscountCents: number;
  /** PROMO_INVALID_MESSAGE, or null. */
  error: string | null;
  disabled?: boolean;
}

/**
 * Spec 2.4. The code is only ever judged by validate_promo_code() — there is no
 * client-side list of valid codes, and the discount that lands on the order comes
 * back from price_order().
 */
export function PromoCodeField({
  code,
  onChangeCode,
  onApply,
  onRemove,
  applying,
  appliedCode,
  appliedDiscountCents,
  error,
  disabled,
}: Props) {
  if (appliedCode) {
    return (
      <Card>
        <View style={styles.stack}>
          <Text variant="heading">Promo Code</Text>
          <View style={styles.appliedRow}>
            <View style={styles.appliedText}>
              <Text variant="bodyStrong" color={colors.success}>
                {appliedCode} applied
              </Text>
              <Text variant="caption" color={colors.textMuted}>
                {`You saved ${formatCents(appliedDiscountCents)}.`}
              </Text>
            </View>
            <Button
              label="Remove"
              variant="ghost"
              fullWidth={false}
              onPress={onRemove}
              disabled={disabled}
            />
          </View>
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <View style={styles.stack}>
        <Text variant="heading">Promo Code</Text>
        <View style={styles.row}>
          <View style={styles.fieldWrap}>
            <Field
              label="Have a code?"
              value={code}
              onChangeText={onChangeCode}
              placeholder="CAMPUS10"
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              editable={!applying && !disabled}
              onSubmitEditing={onApply}
              accessibilityLabel="Promo code"
            />
          </View>
          <Button
            label="Apply"
            variant="secondary"
            fullWidth={false}
            loading={applying}
            disabled={disabled || code.trim().length === 0}
            onPress={onApply}
            style={styles.applyButton}
          />
        </View>
        {error ? (
          <View accessibilityLiveRegion="polite">
            <Banner tone="danger" message={error} />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  fieldWrap: { flex: 1 },
  applyButton: { minWidth: 96 },
  appliedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  appliedText: { flex: 1, gap: 2 },
});

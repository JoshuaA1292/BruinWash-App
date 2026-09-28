import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card, Field, Text } from '@/components/ui';
import { TIP_PERCENTS, formatCents } from '@/constants/pricing';
import { colors, radius, spacing } from '@/theme';

export type TipChoice =
  | { kind: 'none' }
  | { kind: 'percent'; percent: number }
  | { kind: 'custom'; cents: number };

/** Percentages apply to the pre-tip subtotal, i.e. after any promo discount. */
export function resolveTipCents(choice: TipChoice, subtotalCents: number): number {
  if (choice.kind === 'percent') {
    return Math.max(Math.round((subtotalCents * choice.percent) / 100), 0);
  }
  if (choice.kind === 'custom') return Math.max(choice.cents, 0);
  return 0;
}

interface Props {
  choice: TipChoice;
  onChange: (next: TipChoice) => void;
  /** Pre-tip subtotal from price_order(), used for the percentage previews. */
  subtotalCents: number;
  /** The dollars text the requester is typing, kept by the parent. */
  customText: string;
  onChangeCustomText: (next: string) => void;
  disabled?: boolean;
}

export function TipSelector({
  choice,
  onChange,
  subtotalCents,
  customText,
  onChangeCustomText,
  disabled,
}: Props) {
  return (
    <Card>
      <View style={styles.stack}>
        <Text variant="heading">Tip for Washer (Optional)</Text>
        <Text variant="caption" color={colors.textMuted}>
          100% of your tip goes to your washer.
        </Text>

        <View style={styles.chips}>
          {TIP_PERCENTS.map((percent) => {
            const selected = choice.kind === 'percent' && choice.percent === percent;
            const amount = Math.round((subtotalCents * percent) / 100);
            return (
              <Chip
                key={percent}
                selected={selected}
                disabled={disabled}
                label={`${percent}%`}
                sublabel={formatCents(amount)}
                accessibilityLabel={`Tip ${percent} percent, ${formatCents(amount)}`}
                onPress={() => onChange({ kind: 'percent', percent })}
              />
            );
          })}
          <Chip
            selected={choice.kind === 'custom'}
            disabled={disabled}
            label="Custom"
            accessibilityLabel="Enter a custom tip amount"
            onPress={() => onChange({ kind: 'custom', cents: dollarsToCents(customText) })}
          />
          <Chip
            selected={choice.kind === 'none'}
            disabled={disabled}
            label="No tip"
            accessibilityLabel="No tip"
            onPress={() => onChange({ kind: 'none' })}
          />
        </View>

        {choice.kind === 'custom' ? (
          <Field
            label="Custom tip"
            value={customText}
            onChangeText={(next) => {
              onChangeCustomText(next);
              onChange({ kind: 'custom', cents: dollarsToCents(next) });
            }}
            placeholder="0.00"
            keyboardType="decimal-pad"
            editable={!disabled}
            hint="Dollars and cents, e.g. 4.50"
            accessibilityLabel="Custom tip amount in dollars"
          />
        ) : null}
      </View>
    </Card>
  );
}

function dollarsToCents(text: string): number {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100);
}

interface ChipProps {
  label: string;
  sublabel?: string;
  selected: boolean;
  disabled?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}

function Chip({ label, sublabel, selected, disabled, accessibilityLabel, onPress }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && !disabled && styles.chipPressed,
        disabled && styles.chipDisabled,
      ]}
    >
      <Text
        variant="bodyStrong"
        color={selected ? colors.textOnPrimary : colors.primary}
      >
        {label}
      </Text>
      {sublabel ? (
        <Text variant="micro" color={selected ? colors.textOnPrimary : colors.textMuted}>
          {sublabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minWidth: 76,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipPressed: { opacity: 0.85 },
  chipDisabled: { opacity: 0.45 },
});

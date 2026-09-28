import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

export const MIN_LOADS = 1;
export const MAX_LOADS = 10;

interface Props {
  value: number;
  onChange: (next: number) => void;
}

/** Load count, 1–10. Everything except the gloves add-on is priced per load. */
export function LoadStepper({ value, onChange }: Props) {
  const step = (delta: number) => {
    const next = Math.min(Math.max(value + delta, MIN_LOADS), MAX_LOADS);
    if (next === value) return;
    void Haptics.selectionAsync();
    onChange(next);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.labelCol}>
        <Text variant="label">Loads</Text>
        <Text variant="caption" color={colors.textMuted}>
          About one full hamper per load
        </Text>
      </View>

      <View
        style={styles.stepper}
        accessibilityRole="adjustable"
        accessibilityLabel="Number of loads"
        accessibilityValue={{ min: MIN_LOADS, max: MAX_LOADS, now: value }}
      >
        <StepButton label="Decrease loads" glyph="−" disabled={value <= MIN_LOADS} onPress={() => step(-1)} />
        <Text variant="bodyStrong" style={styles.count}>
          {value}
        </Text>
        <StepButton label="Increase loads" glyph="+" disabled={value >= MAX_LOADS} onPress={() => step(1)} />
      </View>
    </View>
  );
}

function StepButton({
  label,
  glyph,
  disabled,
  onPress,
}: {
  label: string;
  glyph: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.stepButton,
        disabled && styles.stepButtonDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text variant="heading" color={disabled ? colors.textSubtle : colors.primary}>
        {glyph}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  labelCol: { flex: 1, gap: spacing.xs / 2 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  stepButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonDisabled: { opacity: 0.5 },
  pressed: { opacity: 0.6 },
  count: { minWidth: 28, textAlign: 'center' },
});

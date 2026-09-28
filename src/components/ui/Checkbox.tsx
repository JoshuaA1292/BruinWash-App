import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from './Text';
import { colors, radius, spacing } from '@/theme';

interface Props {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Checkbox({ checked, onChange, label, disabled }: Props) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        void Haptics.selectionAsync();
        onChange(!checked);
      }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      hitSlop={8}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? (
          <Text variant="caption" color={colors.textOnPrimary} style={styles.tick}>
            ✓
          </Text>
        ) : null}
      </View>
      <Text variant="caption" color={colors.text} style={styles.label}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  pressed: { opacity: 0.7 },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { lineHeight: 16, fontWeight: '700' },
  label: { flex: 1, lineHeight: 19 },
});

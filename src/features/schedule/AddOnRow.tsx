import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Checkbox, Text } from '@/components/ui';
import { colors, spacing } from '@/theme';

interface Props {
  label: string;
  /** e.g. "$0.50 / load" — the footnote pricing from the live site. */
  price: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

/** One of the two booking add-ons: detergent pods, or gloves. */
export function AddOnRow({ label, price, checked, onChange }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.checkbox}>
        <Checkbox checked={checked} onChange={onChange} label={label} />
      </View>
      <Text variant="caption" color={colors.textMuted}>
        {price}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: { flex: 1 },
});

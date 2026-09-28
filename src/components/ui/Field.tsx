import React from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Text } from './Text';
import { colors, radius, spacing, typography } from '@/theme';

interface Props extends TextInputProps {
  label: string;
  hint?: string;
  error?: string | null;
  optional?: boolean;
}

export function Field({ label, hint, error, optional, style, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text variant="label" color={colors.text}>
          {label}
        </Text>
        {optional ? (
          <Text variant="caption" color={colors.textSubtle}>
            Optional
          </Text>
        ) : null}
      </View>
      <TextInput
        style={[styles.input, Boolean(error) && styles.inputError, style]}
        placeholderTextColor={colors.textSubtle}
        accessibilityLabel={label}
        {...rest}
      />
      {error ? (
        <Text variant="caption" color={colors.danger}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color={colors.textMuted}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: typography.body.fontSize,
  },
  inputError: { borderColor: colors.danger },
});

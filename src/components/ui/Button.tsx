import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from './Text';
import { colors, radius, spacing } from '@/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  /** Right-aligned trailing text, e.g. the price on "Continue to Checkout". */
  trailing?: string;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  fullWidth = true,
  trailing,
  style,
  haptic = true,
}: Props) {
  const inert = disabled || loading;

  const handlePress = () => {
    if (inert || !onPress) return;
    if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inert), busy: Boolean(loading) }}
      accessibilityLabel={trailing ? `${label}, ${trailing}` : label}
      onPress={handlePress}
      disabled={inert}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        fullWidth && styles.fullWidth,
        pressed && !inert && styles.pressed,
        inert && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? colors.textOnPrimary : colors.primary} />
      ) : (
        <View style={styles.row}>
          <Text variant="bodyStrong" color={labelColor(variant)}>
            {label}
          </Text>
          {trailing ? (
            <>
              <Text variant="bodyStrong" color={labelColor(variant)} style={styles.dot}>
                ·
              </Text>
              <Text variant="bodyStrong" color={labelColor(variant)}>
                {trailing}
              </Text>
            </>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

function labelColor(variant: Variant): string {
  if (variant === 'primary' || variant === 'danger') return colors.textOnPrimary;
  if (variant === 'ghost') return colors.primary;
  return colors.primary;
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  fullWidth: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { opacity: 0.6 },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.primarySoft },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.danger },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
});

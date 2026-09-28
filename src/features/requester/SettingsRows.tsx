import React from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Text } from '@/components/ui';
import { colors, spacing } from '@/theme';

/** A tappable settings row: label, optional value, chevron. */
export function LinkRow({
  label,
  value,
  onPress,
  accessibilityHint,
}: {
  label: string;
  value?: string | null;
  onPress: () => void;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text variant="body" color={colors.text} style={styles.grow}>
        {label}
      </Text>
      {value ? (
        <Text variant="caption" color={colors.textMuted}>
          {value}
        </Text>
      ) : null}
      <Text variant="body" color={colors.textSubtle}>
        ›
      </Text>
    </Pressable>
  );
}

/** A switch row. The toggle itself carries the accessible name. */
export function ToggleRow({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.grow}>
        <Text variant="body" color={colors.text}>
          {label}
        </Text>
        {description ? (
          <Text variant="caption" color={colors.textMuted} style={styles.description}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.borderStrong }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

/** A labelled list of plain sentences, e.g. the cancellation policy. */
export function BulletList({ items }: { items: readonly string[] }) {
  return (
    <View style={styles.bullets}>
      {items.map((item) => (
        <View key={item} style={styles.bulletRow}>
          <Text variant="caption" color={colors.primary}>
            •
          </Text>
          <Text variant="caption" color={colors.textMuted} style={styles.bulletText}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    paddingVertical: spacing.sm,
  },
  pressed: { opacity: 0.7 },
  grow: { flex: 1, gap: spacing.xs },
  description: { lineHeight: 18 },
  bullets: { gap: spacing.sm },
  bulletRow: { flexDirection: 'row', gap: spacing.sm },
  bulletText: { flex: 1, lineHeight: 19 },
});

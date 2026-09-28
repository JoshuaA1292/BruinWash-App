import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { colors, radius, spacing } from '@/theme';

type Tone = 'warning' | 'success' | 'danger' | 'info';

const TONES: Record<Tone, { bg: string; border: string; fg: string }> = {
  warning: { bg: colors.warningSurface, border: colors.warningBorder, fg: colors.warning },
  success: { bg: colors.successSurface, border: colors.success, fg: colors.success },
  danger: { bg: colors.dangerSurface, border: colors.danger, fg: colors.danger },
  info: { bg: colors.primarySoft, border: colors.primaryLight, fg: colors.primaryDark },
};

interface Props {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  message?: string;
}

export function Banner({ tone = 'info', title, children, message }: Props) {
  const t = TONES[tone];
  return (
    <View style={[styles.box, { backgroundColor: t.bg, borderColor: t.border }]}>
      {title ? (
        <Text variant="bodyStrong" color={t.fg}>
          {title}
        </Text>
      ) : null}
      {message ? (
        <Text variant="caption" color={colors.text} style={styles.body}>
          {message}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  body: { lineHeight: 19 },
});

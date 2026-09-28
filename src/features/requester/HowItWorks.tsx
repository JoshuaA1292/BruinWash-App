import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

/** The three-step explainer, worded exactly as on campuswash.app. */
const STEPS = [
  {
    title: 'Schedule a pickup',
    body: 'Pick your building, choose a date and time, and select your service level.',
  },
  {
    title: 'Bag your clothes',
    body:
      'Bag your clothes and meet your washer at the end of the hall at the scheduled time.',
  },
  {
    title: 'Get them back clean',
    body:
      'Your clothes come back washed and dried — or folded too, if you pick the full service.',
  },
] as const;

export function HowItWorks() {
  return (
    <Card style={styles.card}>
      <Text variant="heading" color={colors.text}>
        How it works
      </Text>
      {STEPS.map((step, index) => (
        <View key={step.title} style={styles.step}>
          <View style={styles.badge}>
            <Text variant="label" color={colors.textOnPrimary}>
              {index + 1}
            </Text>
          </View>
          <View style={styles.stepText}>
            <Text variant="bodyStrong" color={colors.text}>
              {step.title}
            </Text>
            <Text variant="caption" color={colors.textMuted} style={styles.body}>
              {step.body}
            </Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  badge: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { flex: 1, gap: spacing.xs },
  body: { lineHeight: 19 },
});

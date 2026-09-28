import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Banner, Button, Card, Text } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { Pill } from './Pieces';

const PROMPT_TITLE = 'Finish setting up payouts';
const PROMPT_BODY =
  'You can accept jobs now, but CampusWash cannot pay you until Stripe has verified your details. It takes about two minutes.';

/** Persistent prompt shown above the Available list until onboarding is done. */
export function ConnectOnboardingBanner({
  onboardingDone,
  onStart,
  pending,
  error,
}: {
  onboardingDone: boolean;
  onStart: () => void;
  pending: boolean;
  error?: string | null;
}) {
  if (onboardingDone) return null;

  return (
    <Banner tone="warning" title={PROMPT_TITLE} message={PROMPT_BODY}>
      {error ? (
        <Text variant="caption" color={colors.danger}>
          {error}
        </Text>
      ) : null}
      <Button
        label="Set up payouts with Stripe"
        onPress={onStart}
        loading={pending}
        variant="primary"
      />
    </Banner>
  );
}

/** Status card used on Earnings and Settings. */
export function ConnectStatusCard({
  onboardingDone,
  onStart,
  pending,
  error,
}: {
  onboardingDone: boolean;
  onStart: () => void;
  pending: boolean;
  error?: string | null;
}) {
  return (
    <Card>
      <View style={styles.header}>
        <Text variant="heading" color={colors.text}>
          Stripe payouts
        </Text>
        <Pill
          label={onboardingDone ? 'Connected' : 'Action needed'}
          tone={onboardingDone ? 'success' : 'danger'}
        />
      </View>
      <Text variant="caption" color={colors.textMuted} style={styles.body}>
        {onboardingDone
          ? 'Your Stripe Express account is verified. Earnings are paid out to the bank account on file.'
          : PROMPT_BODY}
      </Text>
      {error ? (
        <Text variant="caption" color={colors.danger}>
          {error}
        </Text>
      ) : null}
      {onboardingDone ? null : (
        <Button
          label="Set up payouts with Stripe"
          onPress={onStart}
          loading={pending}
          style={styles.cta}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  body: { lineHeight: 19, marginTop: spacing.xs },
  cta: { marginTop: spacing.md },
});

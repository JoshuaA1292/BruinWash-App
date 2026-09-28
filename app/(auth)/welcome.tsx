import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Banner, Button, Screen, Text } from '@/components/ui';
import { TrustChips } from '@/features/auth';
import { SAFETY_NOTES } from '@/constants/copy';
import { isSupabaseConfigured } from '@/lib/supabase';
import { colors, radius, spacing } from '@/theme';

/**
 * The unauthenticated landing screen — the mobile translation of the
 * campuswash.app home page: one headline, one subhead, and the two CTAs that
 * split requesters from washers before the form ever appears.
 */
export default function Welcome() {
  const goToSignup = (role: 'requester' | 'washer') => {
    router.push({ pathname: '/(auth)/signup', params: { role } });
  };

  return (
    <Screen background={colors.primary} contentStyle={styles.content}>
      <View style={styles.hero}>
        <Text variant="micro" color={colors.primarySoft} style={styles.wordmark}>
          CAMPUSWASH
        </Text>
        <Text variant="display" color={colors.textOnPrimary} style={styles.headline}>
          Student-run laundry pickup on your campus.
        </Text>
        <Text variant="body" color={colors.primarySoft} style={styles.subhead}>
          Whether you need clean clothes or want to earn washing laundry loads, CampusWash has you
          covered.
        </Text>
      </View>

      <View style={styles.sheet}>
        {!isSupabaseConfigured ? (
          <Banner
            tone="warning"
            title="This build is not connected yet"
            message={
              'Copy .env.example to .env and fill in EXPO_PUBLIC_SUPABASE_URL and ' +
              'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then restart the dev server. ' +
              'Signing up and logging in will not work until you do.'
            }
          />
        ) : null}

        <View style={styles.ctas}>
          <Button
            label="Get your laundry done"
            onPress={() => goToSignup('requester')}
            disabled={!isSupabaseConfigured}
          />
          <Button
            label="Become a washer"
            variant="secondary"
            onPress={() => goToSignup('washer')}
            disabled={!isSupabaseConfigured}
          />
        </View>

        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Log in to an existing account"
          onPress={() => router.push('/(auth)/login')}
          disabled={!isSupabaseConfigured}
          hitSlop={8}
          style={({ pressed }) => [styles.loginRow, pressed && styles.pressed]}
        >
          <Text variant="caption" color={colors.textMuted}>
            Already have an account?{' '}
          </Text>
          <Text variant="bodyStrong" color={colors.primary}>
            Log in
          </Text>
        </Pressable>

        <View style={styles.divider} />

        <TrustChips notes={SAFETY_NOTES} />

        <Text variant="micro" color={colors.textSubtle} center style={styles.trustLine}>
          Student-to-student. Not affiliated with any university.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 0, gap: 0, flexGrow: 1 },
  hero: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl + spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  wordmark: { letterSpacing: 2 },
  headline: { lineHeight: 38 },
  subhead: { lineHeight: 23 },
  sheet: {
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  ctas: { gap: spacing.md },
  loginRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  trustLine: { lineHeight: 16 },
});

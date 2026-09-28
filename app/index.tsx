import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Banner, Button, Screen, Text } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { colors, spacing } from '@/theme';

/**
 * Entry hub. Sends each user to the surface that matches their state; the
 * guards in app/_layout.tsx are what actually enforce access.
 */
export default function Index() {
  const { session, profile, initializing, profileError, needsProfileSetup, isWasher, isAdmin, refreshProfile, signOut } =
    useAuth();

  if (initializing) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.textOnPrimary} />
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/welcome" />;

  // Signed in but the profile never arrived. Every guard below keys off
  // `profile`, so without this the user would sit on a blank screen forever with
  // no way out.
  if (!profile) {
    return (
      <Screen scroll={false} contentStyle={styles.recover}>
        <Banner
          tone={profileError ? 'danger' : 'info'}
          title={profileError ? 'We could not load your account' : 'Finishing sign-in'}
          message={
            profileError ??
            'Your account is still being set up. If this does not clear in a moment, try again.'
          }
        />
        <Button label="Try again" onPress={() => void refreshProfile()} />
        <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
        <Text variant="caption" color={colors.textMuted} center>
          Signing out is safe — any order you have already placed is unaffected.
        </Text>
      </Screen>
    );
  }

  if (needsProfileSetup) return <Redirect href="/onboarding/profile-setup" />;
  if (profile.onboarding_tour_done === false) return <Redirect href="/onboarding/tour" />;
  if (isAdmin) return <Redirect href="/(admin)" />;
  if (isWasher) return <Redirect href="/(washer)" />;
  return <Redirect href="/(requester)" />;
}

const styles = {
  splash: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.primary,
  },
  recover: { justifyContent: 'center' as const, gap: spacing.lg },
};

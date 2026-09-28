import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme';

/**
 * Entry hub. Sends each user to the surface that matches their state; the
 * guards in app/_layout.tsx are what actually enforce access.
 */
export default function Index() {
  const { session, profile, initializing, needsProfileSetup, isWasher, isAdmin } = useAuth();

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
        <ActivityIndicator color={colors.textOnPrimary} />
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/welcome" />;
  if (needsProfileSetup) return <Redirect href="/onboarding/profile-setup" />;
  if (profile?.onboarding_tour_done === false) return <Redirect href="/onboarding/tour" />;
  if (isAdmin) return <Redirect href="/(admin)" />;
  if (isWasher) return <Redirect href="/(washer)" />;
  return <Redirect href="/(requester)" />;
}

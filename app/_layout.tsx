import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { QueryProvider } from '@/providers/QueryProvider';
import { NotificationsProvider } from '@/providers/NotificationsProvider';
import { StripeProviderShell } from '@/providers/StripeProviderShell';
import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <AuthProvider>
            <StripeProviderShell>
              <NotificationsProvider>
                <StatusBar style="light" />
                <RootNavigator />
              </NotificationsProvider>
            </StripeProviderShell>
          </AuthProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { session, profile, initializing, isRequester, isWasher, isAdmin, needsProfileSetup } =
    useAuth();

  useEffect(() => {
    if (!initializing) void SplashScreen.hideAsync();
  }, [initializing]);

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
        <ActivityIndicator color={colors.textOnPrimary} />
      </View>
    );
  }

  const signedIn = Boolean(session);
  // A signed-in user with no building or name yet cannot be matched to orders,
  // so setup takes precedence over the role tabs.
  const setupPending = signedIn && needsProfileSetup;
  const tourPending = signedIn && !setupPending && profile?.onboarding_tour_done === false;
  const inApp = signedIn && !setupPending && !tourPending;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.textOnPrimary,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: colors.surfaceAlt },
      }}
    >
      {/* SDK 57 has no redirectTo on Stack.Protected, so guards are written to be
          mutually exclusive: exactly one branch is reachable at any moment. */}
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={setupPending}>
        <Stack.Screen name="onboarding/profile-setup" options={{ title: 'Finish your profile' }} />
      </Stack.Protected>

      <Stack.Protected guard={tourPending}>
        <Stack.Screen name="onboarding/tour" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={inApp}>
        <Stack.Protected guard={isRequester}>
          <Stack.Screen name="(requester)" options={{ headerShown: false }} />
        </Stack.Protected>

        <Stack.Protected guard={isWasher}>
          <Stack.Screen name="(washer)" options={{ headerShown: false }} />
        </Stack.Protected>

        <Stack.Protected guard={isAdmin}>
          <Stack.Screen name="(admin)" options={{ headerShown: false }} />
        </Stack.Protected>

        <Stack.Screen name="order/[id]/index" options={{ title: 'Your order' }} />
        {/* No native header: the chat screen draws its own inside the
            KeyboardAvoidingView. With a native header present, RN measures the
            KAV frame parent-relative while the keyboard height is screen-relative,
            so the composer ends up partly under the keyboard on iOS. */}
        <Stack.Screen name="order/[id]/chat" options={{ headerShown: false }} />
        <Stack.Screen
          name="order/[id]/rate"
          options={{ presentation: 'modal', title: 'Rate your washer' }}
        />
        <Stack.Screen
          name="checkout"
          options={{ presentation: 'modal', title: 'Checkout', headerShown: false }}
        />
        <Stack.Screen name="inbox" options={{ title: 'Notifications' }} />
        <Stack.Screen name="settings/notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="dispute/[id]" options={{ presentation: 'modal', title: 'Report an issue' }} />
      </Stack.Protected>

      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}

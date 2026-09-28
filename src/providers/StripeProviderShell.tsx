import React from 'react';
import { stripeModule, stripeNativeAvailable } from '@/lib/stripe';

const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

const hasKey =
  publishableKey.startsWith('pk_test_') || publishableKey.startsWith('pk_live_');

/**
 * Stripe is usable only when BOTH a key is set and the native module is present.
 * In Expo Go or on web the module is absent, so checkout runs its preview path
 * instead of crashing on a missing native module.
 */
export const isStripeConfigured = hasKey && stripeNativeAvailable;

/**
 * Wraps the app in Stripe's native provider so checkout can use the Payment
 * Sheet (spec 2.4: a bottom sheet, not a browser redirect). With no key
 * configured the provider is skipped entirely so the app still boots.
 */
export function StripeProviderShell({ children }: { children: React.ReactNode }) {
  if (!isStripeConfigured || !stripeModule?.StripeProvider) {
    if (__DEV__) {
      console.warn(
        hasKey
          ? '[BruinWash] Stripe native module unavailable (Expo Go or web) — checkout runs in preview mode.'
          : '[BruinWash] EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set — checkout runs in preview mode.',
      );
    }
    return <>{children}</>;
  }

  const StripeProvider = stripeModule.StripeProvider;

  return (
    <StripeProvider
      publishableKey={publishableKey}
      merchantIdentifier="merchant.app.campuswash.bruinwash"
      urlScheme="bruinwash"
    >
      {/* StripeProvider types children as a ReactElement, so wrap the node. */}
      <>{children}</>
    </StripeProvider>
  );
}

import React from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';

const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

export const isStripeConfigured =
  publishableKey.startsWith('pk_test_') || publishableKey.startsWith('pk_live_');

/**
 * Wraps the app in Stripe's native provider so checkout can use the Payment
 * Sheet (spec 2.4: a bottom sheet, not a browser redirect). With no key
 * configured the provider is skipped entirely so the app still boots.
 */
export function StripeProviderShell({ children }: { children: React.ReactNode }) {
  if (!isStripeConfigured) {
    if (__DEV__) {
      console.warn(
        '[BruinWash] EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set — checkout will run in preview mode.',
      );
    }
    return <>{children}</>;
  }

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

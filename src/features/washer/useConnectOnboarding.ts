import { useCallback, useState } from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { useAuth } from '@/providers/AuthProvider';

/**
 * Stripe Connect Express onboarding. The 'connect-onboarding' Edge Function
 * creates (or reuses) the washer's connected account and returns an account-link
 * URL; profiles.stripe_onboarding_done is server-managed — the client cannot
 * write it (guard_profile_privileges blocks it), so we refresh the profile when
 * the browser session closes and let the webhook be the source of truth.
 */
export function useConnectOnboarding() {
  const { refreshProfile } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError('Payouts are unavailable until Supabase is configured.');
      return;
    }

    setPending(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke<{ url?: string }>(
        'connect-onboarding',
      );
      if (fnError) throw fnError;

      const url = data?.url;
      if (!url) {
        throw new Error('Stripe onboarding is unavailable right now. Please try again shortly.');
      }

      await WebBrowser.openAuthSessionAsync(url, Linking.createURL('/'));
      // Stripe redirects back as soon as the form is submitted; the account may
      // still be verifying, so just re-read the server's view of the profile.
      await refreshProfile();
    } catch (e) {
      setError(friendlyError(e, 'We could not open Stripe onboarding. Please try again.'));
    } finally {
      setPending(false);
    }
  }, [refreshProfile]);

  return { start, pending, error, clearError: () => setError(null) };
}

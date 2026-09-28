import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { useAuth } from '@/providers/AuthProvider';

interface CompleteTour {
  /** Marks the tour done, refreshes the cached profile, then leaves the tour. */
  complete: () => Promise<void>;
  saving: boolean;
  error: string | null;
}

/**
 * profiles_update_self lets a user write their own row, so the flag is a plain
 * UPDATE — no RPC exists for it and none is needed (it is not money and not an
 * order mutation). The root layout guards on onboarding_tour_done, so the
 * profile has to be refreshed before we navigate or the guard bounces us back.
 */
export function useCompleteTour(): CompleteTour {
  const { session, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = useCallback(async () => {
    const userId = session?.user.id;
    if (!userId) {
      router.replace('/');
      return;
    }

    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ onboarding_tour_done: true })
      .eq('id', userId);

    if (updateError) {
      setError(friendlyError(updateError, 'We could not save your progress. Please try again.'));
      setSaving(false);
      return;
    }

    await refreshProfile();
    setSaving(false);
    router.replace('/');
  }, [session?.user.id, refreshProfile]);

  return { complete, saving, error };
}

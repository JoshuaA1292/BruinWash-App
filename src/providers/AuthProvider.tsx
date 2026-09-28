import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/types/database';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  /** True until the stored session has been restored — gate navigation on this. */
  initializing: boolean;
  role: UserRole | null;
  isRequester: boolean;
  isWasher: boolean;
  isAdmin: boolean;
  /** A washer still missing a building cannot be matched to orders. */
  needsProfileSetup: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initializing, setInitializing] = useState(true);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[auth] could not load profile:', error.message);
      return;
    }
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session ?? null);
      await loadProfile(data.session?.user.id);
      if (active) setInitializing(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Fire and forget: the listener must stay synchronous.
      void loadProfile(next?.user.id);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    await loadProfile(session?.user.id);
  }, [loadProfile, session?.user.id]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo<AuthState>(() => {
    const role = profile?.role ?? null;
    return {
      session,
      profile,
      initializing,
      role,
      isRequester: role === 'requester',
      isWasher: role === 'washer',
      isAdmin: role === 'admin',
      needsProfileSetup: Boolean(profile) && (!profile?.building_id || !profile?.first_name),
      refreshProfile,
      signOut,
    };
  }, [session, profile, initializing, refreshProfile, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}

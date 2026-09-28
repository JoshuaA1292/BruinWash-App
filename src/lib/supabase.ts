import 'expo-sqlite/localStorage/install';
import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** True when .env still holds the placeholders, so the UI can explain itself. */
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseKey &&
    !supabaseUrl.includes('YOUR-PROJECT-REF') &&
    !supabaseKey.startsWith('YOUR_'),
);

if (!isSupabaseConfigured && __DEV__) {
  console.warn(
    '[BruinWash] Supabase is not configured. Copy .env.example to .env and fill in ' +
      'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
  );
}

/**
 * Sessions persist in the localStorage shim that expo-sqlite installs, which is
 * the setup Expo documents for SDK 57. detectSessionInUrl is false because
 * native apps have no URL to read a session from.
 */
export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseKey ?? 'placeholder-key',
  {
    auth: {
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

/**
 * Supabase only refreshes tokens while the app is in the foreground; leaving the
 * timer running in the background burns battery and can fire on a dead socket.
 */
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}

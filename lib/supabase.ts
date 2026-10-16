import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { secureSessionStorage } from '@/lib/secure-session-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * createClient throws on an empty URL, which would crash the app at import time when the env
 * vars are missing. In that case a placeholder client is built and never used: auth and sync
 * check isSyncConfigured() first, and any stray query fails fast with a network error that
 * callers already swallow.
 */
const configured = Boolean(supabaseUrl && supabaseAnonKey);

if (!configured && __DEV__) {
  console.warn(
    '[auth] Supabase is not configured (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY missing). ' +
      'Sync and accounts are off. After editing .env, restart with `npx expo start -c`.'
  );
}

export const supabase = createClient(
  configured ? supabaseUrl : 'https://unconfigured.invalid',
  configured ? supabaseAnonKey : 'unconfigured',
  {
    auth: {
      storage: secureSessionStorage,
      persistSession: configured,
      autoRefreshToken: configured,
      detectSessionInUrl: false,
    },
  }
);

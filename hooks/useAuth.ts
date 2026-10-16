import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { deriveAuthState, getAuthState } from '@/lib/auth';
import { isSyncConfigured } from '@/lib/sync-status';
import type { AuthState } from '@/lib/types';

const NONE: AuthState = { status: 'none', email: null, method: null };

/** Current auth status: no session, an anonymous session, or signed in (with the account email). */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(NONE);

  useEffect(() => {
    if (!isSyncConfigured()) return;
    let active = true;
    getAuthState().then((s) => {
      if (active) setState(s);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Only derive from the session handed in; calling back into supabase here can deadlock.
      if (active) setState(deriveAuthState(session));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}

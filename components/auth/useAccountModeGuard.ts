import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { AuthState } from '@/lib/types';
import type { AuthFormMode } from '@/components/auth/AuthForm';

/** Whether a form mode makes sense for the current account state. */
export function modeFitsAuth(mode: AuthFormMode, auth: Pick<AuthState, 'status' | 'method'>): boolean {
  if (mode === 'changePassword') return auth.status === 'signedIn' && auth.method === 'email';
  if (mode === 'signUp' || mode === 'signIn') return auth.status !== 'signedIn';
  return true;
}

/**
 * Calls `onMisfit` once if the screen was opened in a mode that does not fit the account, for
 * example sign-in while signed in. Only the first resolved state counts: signing in from the
 * form changes the status on purpose and must not dismiss it.
 */
export function useAccountModeGuard(mode: AuthFormMode, onMisfit: () => void): void {
  const auth = useAuth();
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current || auth.status === 'none') return;
    checked.current = true;
    if (!modeFitsAuth(mode, auth)) onMisfit();
  }, [auth, mode, onMisfit]);
}

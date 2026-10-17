import type { EmailSignUpOutcome, SignInOutcome } from '@/lib/auth';
import { hasRestoredData } from '@/lib/restore';

export type AuthContext = 'onboarding' | 'settings';

/**
 * Where to go after an auth action.
 * - mode: continue to the tracking mode screen (new account, or restored account with nothing to show)
 * - tabs: replace with the home tab for the stored mode; `completeOnboarding` marks onboarding done first
 * - back: close the screen (Settings)
 * - stay: remain on the form (error, cancel, or a restore that needs a retry)
 */
export type AuthRoute =
  | { to: 'mode' }
  | { to: 'tabs'; completeOnboarding: true }
  | { to: 'back' }
  | { to: 'stay'; retryRestore?: boolean; message?: string };

export function routeAfterAuth(
  outcome: SignInOutcome | EmailSignUpOutcome,
  context: AuthContext
): AuthRoute {
  switch (outcome.status) {
    case 'signedUp':
      return context === 'onboarding' ? { to: 'mode' } : { to: 'back' };
    case 'signedIn': {
      const { restore } = outcome;
      if (!restore.ok) {
        return {
          to: 'stay',
          retryRestore: true,
          message: 'Signed in, but your data could not be restored.',
        };
      }
      if (hasRestoredData(restore)) {
        // Settings is already on top of the tabs: go back rather than stack a second instance.
        return context === 'settings' ? { to: 'back' } : { to: 'tabs', completeOnboarding: true };
      }
      return context === 'onboarding' ? { to: 'mode' } : { to: 'back' };
    }
    case 'error':
      return { to: 'stay', message: outcome.message };
    default:
      return { to: 'stay' };
  }
}

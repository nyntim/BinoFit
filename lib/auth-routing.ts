import type { EmailSignUpOutcome, SignInOutcome } from '@/lib/auth';

export type AuthContext = 'onboarding' | 'settings';

/**
 * Where to go after an auth action.
 * - goals: continue to the goals screen (new account, or restored account without goals)
 * - tabs: replace with the dashboard; `completeOnboarding` marks onboarding done first
 * - back: close the screen (Settings)
 * - stay: remain on the form (error, cancel, or a restore that needs a retry)
 */
export type AuthRoute =
  | { to: 'goals' }
  | { to: 'tabs'; completeOnboarding: true }
  | { to: 'back' }
  | { to: 'stay'; retryRestore?: boolean; message?: string };

export function routeAfterAuth(
  outcome: SignInOutcome | EmailSignUpOutcome,
  context: AuthContext
): AuthRoute {
  switch (outcome.status) {
    case 'signedUp':
      return context === 'onboarding' ? { to: 'goals' } : { to: 'back' };
    case 'signedIn': {
      const { restore } = outcome;
      if (!restore.ok) {
        return {
          to: 'stay',
          retryRestore: true,
          message: 'Signed in, but your data could not be restored.',
        };
      }
      if (restore.goalsRestored) {
        // Settings is already on top of the tabs: go back rather than stack a second instance.
        return context === 'settings' ? { to: 'back' } : { to: 'tabs', completeOnboarding: true };
      }
      return context === 'onboarding' ? { to: 'goals' } : { to: 'back' };
    }
    case 'error':
      return { to: 'stay', message: outcome.message };
    default:
      return { to: 'stay' };
  }
}

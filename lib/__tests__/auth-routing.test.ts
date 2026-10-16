import { routeAfterAuth } from '@/lib/auth-routing';

const restoreOk = (goalsRestored: boolean) =>
  ({ ok: true, logsRestored: 0, unresolvedFoods: 0, mealsRestored: false, goalsRestored }) as never;

describe('routeAfterAuth', () => {
  it('sign-up continues to goals during onboarding and closes in settings', () => {
    expect(routeAfterAuth({ status: 'signedUp' }, 'onboarding')).toEqual({ to: 'goals' });
    expect(routeAfterAuth({ status: 'signedUp' }, 'settings')).toEqual({ to: 'back' });
  });

  it('sign-in with restored goals goes to the dashboard in onboarding and back in settings', () => {
    const outcome = { status: 'signedIn', restore: restoreOk(true) } as never;
    expect(routeAfterAuth(outcome, 'onboarding')).toEqual({ to: 'tabs', completeOnboarding: true });
    expect(routeAfterAuth(outcome, 'settings')).toEqual({ to: 'back' });
  });

  it('sign-in without restored goals goes to goals in onboarding and back in settings', () => {
    const outcome = { status: 'signedIn', restore: restoreOk(false) } as never;
    expect(routeAfterAuth(outcome, 'onboarding')).toEqual({ to: 'goals' });
    expect(routeAfterAuth(outcome, 'settings')).toEqual({ to: 'back' });
  });

  it('a failed restore stays on the form with a retry offer in both contexts', () => {
    const outcome = { status: 'signedIn', restore: { ok: false, error: 'x' } } as never;
    for (const ctx of ['onboarding', 'settings'] as const) {
      expect(routeAfterAuth(outcome, ctx)).toEqual({
        to: 'stay',
        retryRestore: true,
        message: 'Signed in, but your data could not be restored.',
      });
    }
  });

  it('errors stay with the message in both contexts', () => {
    for (const ctx of ['onboarding', 'settings'] as const) {
      expect(routeAfterAuth({ status: 'error', message: 'bad' }, ctx)).toEqual({ to: 'stay', message: 'bad' });
    }
  });

  it('cancel and confirmEmail stay without a message', () => {
    for (const ctx of ['onboarding', 'settings'] as const) {
      expect(routeAfterAuth({ status: 'cancelled' }, ctx)).toEqual({ to: 'stay' });
      expect(routeAfterAuth({ status: 'confirmEmail', email: 'a@b.com' }, ctx)).toEqual({ to: 'stay' });
    }
  });
});

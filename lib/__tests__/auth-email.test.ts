import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@/lib/restore', () => ({ hasRestoredData: (s: any) => s.goalsRestored || s.logsRestored > 0, restoreFromAccount: jest.fn() }));
jest.mock('@/lib/sync', () => ({
  syncToSupabase: jest.fn(async () => {}),
  waitForSyncIdle: jest.fn(async () => {}),
}));
jest.mock('@/lib/reminders', () => ({ restoreMealReminders: jest.fn(async () => {}) }));
jest.mock('@/lib/device-id', () => ({ getDeviceId: jest.fn(async () => 'legacy-device') }));
jest.mock('@/lib/database', () => ({
  clearUserData: jest.fn(async () => {}),
  markAllUnsynced: jest.fn(async () => {}),
  getUnsyncedCustomFoods: jest.fn(async () => []),
  markCustomFoodsSynced: jest.fn(async () => {}),
  getUnsyncedFoodLogs: jest.fn(async () => []),
  getUnsyncedMealDefinitions: jest.fn(async () => []),
  getUnsyncedMealNames: jest.fn(async () => []),
}));

import { supabase } from '@/lib/supabase';
import * as auth from '@/lib/auth';
import * as db from '@/lib/database';
import { restoreFromAccount } from '@/lib/restore';
import { syncToSupabase } from '@/lib/sync';
import { clearAuthIssue, getLastAuthIssue } from '@/lib/auth-debug';
import { isAuthTransitioning, resetAuthTransition } from '@/lib/auth-transition';
import { getPendingMergeTicket, getSyncedUid, setSyncedUid } from '@/lib/storage';

const sb = supabase as any;
const anonUser = { id: 'anon-1', is_anonymous: true, email: null, app_metadata: { provider: 'anonymous' } };
const anonSession = { user: anonUser };
const emailUser = { id: 'acct-1', is_anonymous: false, email: 'a@b.com', app_metadata: { providers: ['email'] } };
const emailSession = { user: emailUser };
const appleUser = { id: 'acct-2', is_anonymous: false, email: 'x@privaterelay.appleid.com', app_metadata: { providers: ['apple'] } };

const RESTORE_OK = { ok: true, logsRestored: 0, unresolvedFoods: 0, mealsRestored: false, goalsRestored: true };
const setSession = (s: unknown) => sb.auth.getSession.mockResolvedValue({ data: { session: s }, error: null });
const events: string[] = [];

beforeEach(async () => {
  jest.clearAllMocks();
  auth.resetAuthRuntimeState();
  resetAuthTransition();
  clearAuthIssue();
  await AsyncStorage.clear();
  events.length = 0;
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  setSession(anonSession);
  sb.rpc.mockImplementation(async (name: string) => {
    events.push(`rpc:${name}`);
    return { data: name === 'create_merge_ticket' ? 'ticket-1' : null, error: null };
  });
  sb.auth.signInAnonymously.mockResolvedValue({ data: { session: anonSession }, error: null });
  sb.auth.signOut.mockResolvedValue({ error: null });
  sb.auth.getUser.mockResolvedValue({ data: { user: {} }, error: null });
  sb.auth.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
  sb.auth.refreshSession.mockResolvedValue({ data: { session: emailSession }, error: null });
  sb.auth.signInWithPassword.mockImplementation(async () => {
    events.push('signInWithPassword');
    return { data: { session: emailSession, user: emailUser }, error: null };
  });
  sb.auth.verifyOtp.mockImplementation(async () => {
    events.push('verifyOtp');
    setSession(emailSession);
    return { data: { session: emailSession, user: emailUser }, error: null };
  });
  (restoreFromAccount as jest.Mock).mockResolvedValue(RESTORE_OK);
});

const rpcCalls = (name: string) => sb.rpc.mock.calls.filter((c: unknown[]) => c[0] === name);

describe('methodFromUser / deriveAuthState', () => {
  it('methodFromUser reads apple, email and nothing else', () => {
    expect(auth.methodFromUser(appleUser as never)).toBe('apple');
    expect(auth.methodFromUser(emailUser as never)).toBe('email');
    expect(auth.methodFromUser({ app_metadata: { provider: 'email' } } as never)).toBe('email');
    expect(auth.methodFromUser({ app_metadata: { provider: 'google' } } as never)).toBeNull();
    expect(auth.methodFromUser({ app_metadata: {} } as never)).toBeNull();
    expect(auth.methodFromUser({} as never)).toBeNull();
  });

  it('apple wins when a user has both providers', () => {
    expect(auth.methodFromUser({ app_metadata: { providers: ['email', 'apple'] } } as never)).toBe('apple');
  });

  it('deriveAuthState carries the method for signed-in users only', () => {
    expect(auth.deriveAuthState({ user: appleUser } as never)).toEqual({ status: 'signedIn', email: appleUser.email, method: 'apple' });
    expect(auth.deriveAuthState(emailSession as never)).toEqual({ status: 'signedIn', email: 'a@b.com', method: 'email' });
    expect(auth.deriveAuthState(anonSession as never)).toEqual({ status: 'anonymous', email: null, method: null });
    expect(auth.deriveAuthState(null).method).toBeNull();
  });
});

describe('signUpWithEmail', () => {
  it('converts the user in place: updateUser then refreshSession, no ticket and no transition', async () => {
    let transitioning: boolean | null = null;
    sb.auth.updateUser.mockImplementation(async () => {
      events.push('updateUser');
      transitioning = isAuthTransitioning();
      return { data: { user: {} }, error: null };
    });
    sb.auth.refreshSession.mockImplementation(async () => {
      events.push('refreshSession');
      return { data: { session: emailSession }, error: null };
    });
    await setSyncedUid('anon-1');
    const out = await auth.signUpWithEmail('  New@Example.COM ', 'password1');
    expect(out).toEqual({ status: 'signedUp' });
    expect(events).toEqual(['updateUser', 'refreshSession']);
    expect(sb.auth.updateUser).toHaveBeenCalledWith({ email: 'new@example.com', password: 'password1' });
    expect(transitioning).toBe(false);
    expect(isAuthTransitioning()).toBe(false);
    expect(rpcCalls('create_merge_ticket')).toHaveLength(0);
    expect(rpcCalls('redeem_merge_ticket')).toHaveLength(0);
    expect(await getPendingMergeTicket()).toBeNull();
    expect(restoreFromAccount).not.toHaveBeenCalled();
    expect(sb.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('keeps the same uid and does not mark anything for resync', async () => {
    sb.auth.refreshSession.mockResolvedValue({ data: { session: { user: { ...emailUser, id: 'anon-1' } } }, error: null });
    await setSyncedUid('anon-1');
    await auth.signUpWithEmail('a@b.com', 'password1');
    expect(await getSyncedUid()).toBe('anon-1');
    expect(db.markAllUnsynced).not.toHaveBeenCalled();
  });

  it('triggers a sync after a successful conversion', async () => {
    await auth.signUpWithEmail('a@b.com', 'password1');
    await new Promise((r) => setImmediate(r));
    expect(syncToSupabase).toHaveBeenCalled();
  });

  it('returns confirmEmail, without refreshing, when the server holds a pending new_email', async () => {
    sb.auth.updateUser.mockResolvedValue({ data: { user: { new_email: 'a@b.com' } }, error: null });
    expect(await auth.signUpWithEmail('A@B.com', 'password1')).toEqual({ status: 'confirmEmail', email: 'a@b.com' });
    expect(sb.auth.refreshSession).not.toHaveBeenCalled();
  });

  it('returns an error when the user is still anonymous after the refresh', async () => {
    sb.auth.refreshSession.mockResolvedValue({ data: { session: anonSession }, error: null });
    const out = await auth.signUpWithEmail('a@b.com', 'password1');
    expect(out.status).toBe('error');
    expect(getLastAuthIssue()?.step).toBe('refreshSession');
  });

  it('returns an error when the refresh itself fails or yields no session', async () => {
    sb.auth.refreshSession.mockResolvedValueOnce({ data: { session: null }, error: { code: 'x', status: 0, message: 'net' } });
    expect((await auth.signUpWithEmail('a@b.com', 'password1')).status).toBe('error');
    sb.auth.refreshSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    expect((await auth.signUpWithEmail('a@b.com', 'password1')).status).toBe('error');
  });

  it('maps updateUser errors to neutral copy', async () => {
    sb.auth.updateUser.mockResolvedValue({ data: { user: null }, error: { code: 'email_exists', message: 'raw' } });
    expect(await auth.signUpWithEmail('a@b.com', 'password1')).toEqual({
      status: 'error',
      message: 'An account with this email already exists. Sign in instead.',
    });
  });

  it('never throws when updateUser rejects', async () => {
    sb.auth.updateUser.mockRejectedValue(new Error('Network request failed'));
    expect(await auth.signUpWithEmail('a@b.com', 'password1')).toEqual({
      status: 'error',
      message: "You're offline. Connect and try again.",
    });
  });

  it('creates an anonymous session first when there is none', async () => {
    setSession(null);
    sb.auth.signInAnonymously.mockImplementation(async () => {
      events.push('signInAnonymously');
      setSession(anonSession);
      return { data: { session: anonSession }, error: null };
    });
    const out = await auth.signUpWithEmail('a@b.com', 'password1');
    expect(events[0]).toBe('signInAnonymously');
    expect(sb.auth.updateUser).toHaveBeenCalled();
    expect(out).toEqual({ status: 'signedUp' });
  });

  it('reports offline when no session can be created, and does not call updateUser', async () => {
    setSession(null);
    sb.auth.signInAnonymously.mockResolvedValue({ data: { session: null }, error: { message: 'down' } });
    expect(await auth.signUpWithEmail('a@b.com', 'password1')).toEqual({
      status: 'error',
      message: "You're offline. Connect and try again.",
    });
    expect(sb.auth.updateUser).not.toHaveBeenCalled();
  });

  it('refuses when already signed in or not configured', async () => {
    setSession(emailSession);
    expect(await auth.signUpWithEmail('a@b.com', 'password1')).toEqual({ status: 'error', message: 'Already signed in.' });
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    expect((await auth.signUpWithEmail('a@b.com', 'password1')).status).toBe('error');
    expect(sb.auth.updateUser).not.toHaveBeenCalled();
  });
});

describe('verifyEmailCode', () => {
  it('verifies with the email_change type, then finishes the conversion', async () => {
    const out = await auth.verifyEmailCode(' A@B.com ', ' 123456 ');
    expect(sb.auth.verifyOtp).toHaveBeenCalledWith({ email: 'a@b.com', token: '123456', type: 'email_change' });
    expect(sb.auth.refreshSession).toHaveBeenCalled();
    expect(out).toEqual({ status: 'signedUp' });
  });

  it('maps a bad code to an error and does not refresh', async () => {
    sb.auth.verifyOtp.mockResolvedValue({ data: {}, error: { code: 'otp_expired', message: 'x' } });
    const out = await auth.verifyEmailCode('a@b.com', '123456');
    expect(out).toEqual({ status: 'error', message: 'This code has expired. Request a new one.' });
    expect(sb.auth.refreshSession).not.toHaveBeenCalled();
  });
});

describe('signInWithEmail', () => {
  it('creates and persists the ticket before signInWithPassword', async () => {
    let atSignIn: unknown = 'unset';
    sb.auth.signInWithPassword.mockImplementation(async () => {
      events.push('signInWithPassword');
      atSignIn = await getPendingMergeTicket();
      return { data: { session: emailSession }, error: null };
    });
    const out = await auth.signInWithEmail(' A@B.com ', 'pw-12345');
    expect(out.status).toBe('signedIn');
    expect(atSignIn).toEqual({ ticket: 'ticket-1', from: 'anon-1' });
    expect(events).toEqual(['rpc:create_merge_ticket', 'signInWithPassword', 'rpc:redeem_merge_ticket']);
    expect(sb.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pw-12345' });
  });

  it('a wrong password clears the ticket, releases the flag, and does not redeem or restore', async () => {
    sb.auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: { code: 'invalid_credentials', message: 'Invalid login credentials' } });
    const out = await auth.signInWithEmail('a@b.com', 'wrongpass');
    expect(out).toEqual({ status: 'error', message: 'Email or password is incorrect.' });
    expect(await getPendingMergeTicket()).toBeNull();
    expect(isAuthTransitioning()).toBe(false);
    expect(rpcCalls('redeem_merge_ticket')).toHaveLength(0);
    expect(restoreFromAccount).not.toHaveBeenCalled();
  });

  it('holds the transition flag while signing in', async () => {
    let during = false;
    sb.auth.signInWithPassword.mockImplementation(async () => {
      during = isAuthTransitioning();
      return { data: { session: emailSession }, error: null };
    });
    await auth.signInWithEmail('a@b.com', 'pw-12345');
    expect(during).toBe(true);
    expect(isAuthTransitioning()).toBe(false);
  });

  it('a retryable redeem error keeps the ticket but still signs in and restores', async () => {
    sb.rpc.mockImplementation(async (name: string) =>
      name === 'redeem_merge_ticket'
        ? { data: null, error: { message: 'network request failed' } }
        : { data: 'ticket-1', error: null }
    );
    const out = await auth.signInWithEmail('a@b.com', 'pw-12345');
    expect(out.status).toBe('signedIn');
    expect(await getPendingMergeTicket()).toEqual({ ticket: 'ticket-1', from: 'anon-1' });
    expect(restoreFromAccount).toHaveBeenCalled();
  });

  it('success redeems, records the synced uid before redeeming, and restores', async () => {
    await setSyncedUid('anon-1');
    let uidAtRedeem: string | null = null;
    sb.rpc.mockImplementation(async (name: string) => {
      if (name === 'redeem_merge_ticket') uidAtRedeem = await getSyncedUid();
      return { data: name === 'create_merge_ticket' ? 'ticket-1' : null, error: null };
    });
    const out = await auth.signInWithEmail('a@b.com', 'pw-12345');
    expect(uidAtRedeem).toBe('acct-1');
    expect(rpcCalls('redeem_merge_ticket')).toEqual([['redeem_merge_ticket', { ticket: 'ticket-1' }]]);
    expect(restoreFromAccount).toHaveBeenCalledWith('acct-1', undefined);
    expect(out).toEqual({ status: 'signedIn', restore: RESTORE_OK });
    expect(await getPendingMergeTicket()).toBeNull();
    expect(db.markAllUnsynced).not.toHaveBeenCalled();
  });

  it('errors when already signed in, without touching the server', async () => {
    setSession(emailSession);
    expect(await auth.signInWithEmail('a@b.com', 'pw-12345')).toEqual({ status: 'error', message: 'Already signed in.' });
    expect(sb.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('reports offline when no session can be created', async () => {
    setSession(null);
    sb.auth.signInAnonymously.mockResolvedValue({ data: { session: null }, error: { message: 'down' } });
    const out = await auth.signInWithEmail('a@b.com', 'pw-12345');
    expect(out).toEqual({ status: 'error', message: "You're offline. Connect and try again." });
    expect(sb.auth.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe('requestPasswordReset and changePassword', () => {
  it('requestPasswordReset normalizes the email and reports ok', async () => {
    expect(await auth.requestPasswordReset(' A@B.com ')).toEqual({ ok: true });
    expect(sb.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.com');
  });

  it('requestPasswordReset maps rate limiting and never throws', async () => {
    sb.auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: { code: 'over_email_send_rate_limit', message: 'x' } });
    expect(await auth.requestPasswordReset('a@b.com')).toEqual({ ok: false, message: 'Too many attempts. Try again in a few minutes.' });
    sb.auth.resetPasswordForEmail.mockRejectedValueOnce(new Error('boom'));
    expect((await auth.requestPasswordReset('a@b.com')).ok).toBe(false);
  });

  it('changePassword succeeds', async () => {
    setSession(emailSession);
    expect(await auth.changePassword('newpassword')).toEqual({ ok: true });
    expect(sb.auth.updateUser).toHaveBeenCalledWith({ password: 'newpassword' });
  });

  it('changePassword rejects anonymous, Apple and signed-out users without calling the server', async () => {
    for (const session of [anonSession, { user: appleUser }, null]) {
      setSession(session);
      const out = await auth.changePassword('newpassword');
      expect(out.ok).toBe(false);
    }
    expect(sb.auth.updateUser).not.toHaveBeenCalled();
  });

  it('changePassword maps errors and survives a rejection', async () => {
    setSession(emailSession);
    sb.auth.updateUser.mockResolvedValueOnce({ data: { user: null }, error: { code: 'same_password', message: 'x' } });
    expect(await auth.changePassword('same')).toEqual({ ok: false, message: 'Choose a password different from the current one.' });
    sb.auth.updateUser.mockRejectedValueOnce(new Error('x'));
    expect((await auth.changePassword('x')).ok).toBe(false);
  });
});

describe('verifyPasswordReset', () => {
  it('signs in through the ticket flow with a recovery code, then changes the password', async () => {
    sb.auth.updateUser.mockImplementation(async () => {
      events.push('updateUser');
      return { data: { user: {} }, error: null };
    });
    const out = await auth.verifyPasswordReset(' A@B.com ', ' 123456 ', 'brandnewpw');
    expect(sb.auth.verifyOtp).toHaveBeenCalledWith({ email: 'a@b.com', token: '123456', type: 'recovery' });
    expect(events).toEqual(['rpc:create_merge_ticket', 'verifyOtp', 'rpc:redeem_merge_ticket', 'updateUser']);
    expect(sb.auth.updateUser).toHaveBeenCalledWith({ password: 'brandnewpw' });
    expect(out).toEqual({ status: 'signedIn', restore: RESTORE_OK });
    expect(restoreFromAccount).toHaveBeenCalledWith('acct-1', undefined);
  });

  it('a password update failure after sign-in is still signedIn, with a warning', async () => {
    sb.auth.verifyOtp.mockImplementation(async () => {
      setSession(emailSession);
      return { data: { session: emailSession, user: emailUser }, error: null };
    });
    sb.auth.updateUser.mockResolvedValue({ data: { user: null }, error: { code: 'weak_password', message: 'x' } });
    const out = await auth.verifyPasswordReset('a@b.com', '123456', 'weak');
    expect(out.status).toBe('signedIn');
    expect((out as { warning?: string }).warning).toMatch(/password was not changed/i);
    expect((out as { warning?: string }).warning).toMatch(/stronger password/i);
  });

  it('a bad code errors without changing the password and clears the ticket', async () => {
    sb.auth.verifyOtp.mockResolvedValue({ data: { session: null }, error: { code: 'otp_expired', message: 'x' } });
    const out = await auth.verifyPasswordReset('a@b.com', '123456', 'brandnewpw');
    expect(out).toEqual({ status: 'error', message: 'This code has expired. Request a new one.' });
    expect(sb.auth.updateUser).not.toHaveBeenCalled();
    expect(await getPendingMergeTicket()).toBeNull();
    expect(isAuthTransitioning()).toBe(false);
  });
});

describe('initAuth hardening', () => {
  it('reports a signInAnonymously error and returns none', async () => {
    setSession(null);
    sb.auth.signInAnonymously.mockResolvedValue({ data: { session: null }, error: { code: 'anonymous_provider_disabled', status: 422, message: 'disabled' } });
    expect(await auth.initAuth()).toEqual({ status: 'none', restored: false });
    expect(getLastAuthIssue()).toMatchObject({ step: 'signInAnonymously', summary: 'anonymous_provider_disabled/422/disabled' });
  });

  it('the cooldown blocks a second attempt within 30 s, and force bypasses it', async () => {
    setSession(null);
    let now = 1_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    sb.auth.signInAnonymously.mockResolvedValue({ data: { session: null }, error: { message: 'rate' } });

    await auth.initAuth();
    expect(sb.auth.signInAnonymously).toHaveBeenCalledTimes(1);

    now += auth.ANON_SIGN_IN_COOLDOWN_MS - 1;
    expect(await auth.initAuth()).toEqual({ status: 'none', restored: false });
    expect(sb.auth.signInAnonymously).toHaveBeenCalledTimes(1);

    await auth.initAuth({ force: true });
    expect(sb.auth.signInAnonymously).toHaveBeenCalledTimes(2);

    now += auth.ANON_SIGN_IN_COOLDOWN_MS * 2;
    await auth.initAuth();
    expect(sb.auth.signInAnonymously).toHaveBeenCalledTimes(3);
    nowSpy.mockRestore();
  });

  it('a successful anonymous sign-in does not start a cooldown', async () => {
    setSession(null);
    await auth.initAuth();
    await auth.initAuth();
    expect(sb.auth.signInAnonymously).toHaveBeenCalledTimes(2);
  });

  it('a stale anonymous session is signed out locally and replaced', async () => {
    sb.auth.getUser.mockResolvedValue({ data: { user: null }, error: { code: 'user_not_found', status: 403, message: 'gone' } });
    const res = await auth.initAuth();
    expect(sb.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(sb.auth.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(res.status).toBe('anonymous');
  });

  it.each(['session_not_found', 'bad_jwt'])('%s also drops a stale anonymous session', async (code) => {
    sb.auth.getUser.mockResolvedValue({ data: { user: null }, error: { code, message: 'x' } });
    await auth.initAuth();
    expect(sb.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(sb.auth.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('a stale signed-in session is reported only, never wiped or replaced', async () => {
    setSession(emailSession);
    sb.auth.getUser.mockResolvedValue({ data: { user: null }, error: { code: 'user_not_found', message: 'gone' } });
    const res = await auth.initAuth();
    expect(sb.auth.signOut).not.toHaveBeenCalled();
    expect(sb.auth.signInAnonymously).not.toHaveBeenCalled();
    expect(db.clearUserData).not.toHaveBeenCalled();
    expect(res.status).toBe('signedIn');
    expect(getLastAuthIssue()?.step).toBe('validateSession');
  });

  it('a transient getUser error (offline) keeps the session and is retried next time', async () => {
    sb.auth.getUser.mockResolvedValue({ data: { user: null }, error: { code: undefined, status: 0, message: 'Network request failed' } });
    await auth.initAuth();
    expect(sb.auth.signOut).not.toHaveBeenCalled();
    expect(sb.auth.signInAnonymously).not.toHaveBeenCalled();
    await auth.initAuth();
    expect(sb.auth.getUser).toHaveBeenCalledTimes(2);
  });

  it('a getUser that throws keeps the session', async () => {
    sb.auth.getUser.mockRejectedValue(new Error('x'));
    expect((await auth.initAuth()).status).toBe('anonymous');
    expect(sb.auth.signOut).not.toHaveBeenCalled();
  });

  it('validates with getUser only once per launch', async () => {
    await auth.initAuth();
    await auth.initAuth();
    await auth.initAuth();
    expect(sb.auth.getUser).toHaveBeenCalledTimes(1);
  });

  it('does not call getUser when there is no session', async () => {
    setSession(null);
    await auth.initAuth();
    expect(sb.auth.getUser).not.toHaveBeenCalled();
  });
});

describe('signInWithMerge lock and same-uid skip', () => {
  it('a second concurrent call is rejected and only one ticket is created', async () => {
    let finish!: () => void;
    const gate = new Promise<void>((r) => { finish = r; });
    const first = auth.signInWithMerge(async () => {
      await gate;
      return { session: emailSession as never };
    });
    await new Promise((r) => setImmediate(r));
    const second = await auth.signInWithMerge(async () => ({ session: emailSession as never }));
    expect(second).toEqual({ status: 'error', message: 'Sign-in is already in progress.' });
    finish();
    expect((await first).status).toBe('signedIn');
    expect(rpcCalls('create_merge_ticket')).toHaveLength(1);
    // The lock is released afterwards.
    expect((await auth.signInWithMerge(async () => ({ cancelled: true }))).status).toBe('cancelled');
  });

  it('skips the redeem and clears the ticket when the user id does not change', async () => {
    const out = await auth.signInWithMerge(async () => ({ session: { user: { ...emailUser, id: 'anon-1' } } as never }));
    expect(out.status).toBe('signedIn');
    expect(rpcCalls('redeem_merge_ticket')).toHaveLength(0);
    expect(await getPendingMergeTicket()).toBeNull();
    expect(restoreFromAccount).toHaveBeenCalledWith('anon-1', undefined);
  });
});

describe('validateSession timeout', () => {
  afterEach(() => jest.useRealTimers());

  it('keeps the session when getUser hangs, and validates again on a later initAuth', async () => {
    jest.useFakeTimers();
    sb.auth.getUser.mockImplementationOnce(() => new Promise(() => {}));
    const run = auth.initAuth();
    await jest.advanceTimersByTimeAsync(auth.VALIDATE_SESSION_TIMEOUT_MS + 10);
    expect((await run).status).toBe('anonymous');
    expect(sb.auth.signOut).not.toHaveBeenCalled();
    expect(sb.auth.signInAnonymously).not.toHaveBeenCalled();
    await auth.initAuth();
    expect(sb.auth.getUser).toHaveBeenCalledTimes(2);
  });
});

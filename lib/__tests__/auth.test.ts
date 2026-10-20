import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Apple from 'expo-apple-authentication';

jest.mock('@/lib/restore', () => ({ hasRestoredData: (s: any) => s.goalsRestored || s.logsRestored > 0, restoreFromAccount: jest.fn(async () => ({ ok: true, logsRestored: 0, unresolvedFoods: 0, mealsRestored: false, goalsRestored: true })) }));
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
import { restoreMealReminders } from '@/lib/reminders';
import { getSyncedUid, setSyncedUid, getPendingWipe, getPendingMergeTicket, getLegacyClaimed, saveUserGoals, setPendingMergeTicket, setOnboardingComplete } from '@/lib/storage';

const sb = supabase as any;
const anonSession = { user: { id: 'anon-1', is_anonymous: true, email: null } };
const appleSession = { user: { id: 'acct-1', is_anonymous: false, email: 'a@b.com' } };

const flush = () => new Promise((r) => setImmediate(r));
const setSession = (s: unknown) => sb.auth.getSession.mockResolvedValue({ data: { session: s }, error: null });

const events: string[] = [];

beforeEach(async () => {
  jest.clearAllMocks();
  auth.resetAuthRuntimeState();
  await AsyncStorage.clear();
  events.length = 0;
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  setSession(anonSession);
  sb.rpc.mockImplementation(async (name: string) => {
    events.push(`rpc:${name}`);
    return { data: name === 'create_merge_ticket' ? 'ticket-1' : null, error: null };
  });
  sb.auth.signInWithIdToken.mockImplementation(async () => {
    events.push('signInWithIdToken');
    return { data: { session: appleSession, user: appleSession.user }, error: null };
  });
  sb.auth.signInAnonymously.mockResolvedValue({ data: { session: anonSession }, error: null });
  sb.auth.signOut.mockResolvedValue({ error: null });
  (Apple.signInAsync as jest.Mock).mockImplementation(async () => {
    events.push('applePrompt');
    return { identityToken: 'apple-id-token' };
  });
  (restoreFromAccount as jest.Mock).mockResolvedValue({ ok: true, logsRestored: 0, unresolvedFoods: 0, mealsRestored: false, goalsRestored: true });
});

describe('pure helpers', () => {
  it('deriveAuthState maps no session, anonymous and signed-in', () => {
    expect(auth.deriveAuthState(null)).toEqual({ status: 'none', email: null, method: null });
    expect(auth.deriveAuthState(anonSession as never)).toEqual({ status: 'anonymous', email: null, method: null });
    expect(auth.deriveAuthState(appleSession as never)).toEqual({ status: 'signedIn', email: 'a@b.com', method: null });
  });

  it('signed-in session without an email gives a null email', () => {
    expect(auth.deriveAuthState({ user: { id: 'x', is_anonymous: false } } as never).email).toBeNull();
  });

  it('isAppleCancel recognises only the cancel code', () => {
    expect(auth.isAppleCancel({ code: 'ERR_REQUEST_CANCELED' })).toBe(true);
    expect(auth.isAppleCancel({ code: 'ERR_OTHER' })).toBe(false);
    expect(auth.isAppleCancel(null)).toBe(false);
    expect(auth.isAppleCancel('ERR_REQUEST_CANCELED')).toBe(false);
  });

  it('isTerminalTicketError matches permanent failures only', () => {
    for (const m of ['ticket expired', 'Invalid ticket', 'invalid caller']) {
      expect(auth.isTerminalTicketError(m)).toBe(true);
    }
    for (const m of ['network request failed', 'timeout', '', 'JWT expired', 'Invalid API key', 'not authenticated', 'ticket not found']) {
      expect(auth.isTerminalTicketError(m)).toBe(false);
    }
  });
});

describe('session accessors', () => {
  it('getSessionUserId returns the session user id', async () => {
    expect(await auth.getSessionUserId()).toBe('anon-1');
  });

  it('getSessionUserId is null without a session or when getSession throws', async () => {
    setSession(null);
    expect(await auth.getSessionUserId()).toBeNull();
    sb.auth.getSession.mockRejectedValue(new Error('x'));
    expect(await auth.getSessionUserId()).toBeNull();
  });

  it('getAuthState reflects the session', async () => {
    setSession(appleSession);
    expect(await auth.getAuthState()).toEqual({ status: 'signedIn', email: 'a@b.com', method: null });
  });
});

describe('initAuth', () => {
  it('is a no-op when supabase is not configured', async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    expect(await auth.initAuth()).toEqual({ status: 'none', restored: false });
    expect(sb.auth.getSession).not.toHaveBeenCalled();
    expect(sb.auth.signInAnonymously).not.toHaveBeenCalled();
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it('signs in anonymously when there is no session, claims legacy data once and syncs', async () => {
    setSession(null);
    const res = await auth.initAuth();
    await flush();
    expect(sb.auth.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(sb.rpc).toHaveBeenCalledWith('claim_device_data', { p_device_id: 'legacy-device' });
    expect(await getLegacyClaimed()).toBe(true);
    expect(res).toEqual({ status: 'anonymous', restored: false });
    expect(syncToSupabase).toHaveBeenCalled();
  });

  it('does not sign in again when a session exists, and skips the claim once flagged', async () => {
    await auth.initAuth();
    sb.rpc.mockClear();
    await auth.initAuth();
    expect(sb.auth.signInAnonymously).not.toHaveBeenCalled();
    expect(sb.rpc).not.toHaveBeenCalledWith('claim_device_data', expect.anything());
  });

  it('retries the claim next launch when the RPC returns an error', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
    await auth.initAuth();
    expect(await getLegacyClaimed()).toBe(false);
  });

  it('returns none and does not sync when no session can be created', async () => {
    setSession(null);
    sb.auth.signInAnonymously.mockRejectedValue(new Error('offline'));
    expect(await auth.initAuth()).toEqual({ status: 'none', restored: false });
    await flush();
    expect(syncToSupabase).not.toHaveBeenCalled();
  });

  it('concurrent calls share one run', async () => {
    setSession(null);
    await Promise.all([auth.initAuth(), auth.initAuth(), auth.initAuth()]);
    expect(sb.auth.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('auto-restores a signed-in session on an empty install', async () => {
    setSession(appleSession);
    const res = await auth.initAuth();
    expect(restoreFromAccount).toHaveBeenCalledWith('acct-1', undefined);
    expect(res).toEqual({ status: 'signedIn', restored: true });
  });

  it('does not restore a signed-in session on an install that finished onboarding', async () => {
    setSession(appleSession);
    await setOnboardingComplete();
    const res = await auth.initAuth();
    expect(restoreFromAccount).not.toHaveBeenCalled();
    expect(res.restored).toBe(false);
  });

  it('does not restore for an anonymous session', async () => {
    await auth.initAuth();
    expect(restoreFromAccount).not.toHaveBeenCalled();
  });
});

describe('signInWithApple', () => {
  it('creates the merge ticket under the anonymous user before the Apple prompt, then redeems after sign-in', async () => {
    const out = await auth.signInWithApple();
    expect(out.status).toBe('signedIn');
    expect(events).toEqual(['rpc:create_merge_ticket', 'applePrompt', 'signInWithIdToken', 'rpc:redeem_merge_ticket']);
    expect(sb.rpc).toHaveBeenCalledWith('redeem_merge_ticket', { ticket: 'ticket-1' });
    expect(await getPendingMergeTicket()).toBeNull();
    expect(restoreFromAccount).toHaveBeenCalledWith('acct-1', undefined);
  });

  it('pushes local rows to the anonymous user before creating the ticket', async () => {
    (syncToSupabase as jest.Mock).mockImplementation(async () => { events.push('sync'); });
    await auth.signInWithApple();
    expect(events.slice(0, 2)).toEqual(['sync', 'rpc:create_merge_ticket']);
  });

  it('gives Apple the SHA-256 hash of the nonce and Supabase the raw value', async () => {
    await auth.signInWithApple();
    const appleNonce = (Apple.signInAsync as jest.Mock).mock.calls[0][0].nonce as string;
    const supaNonce = sb.auth.signInWithIdToken.mock.calls[0][0].nonce as string;
    expect(Crypto.digestStringAsync).toHaveBeenCalledWith('SHA-256', supaNonce);
    expect(appleNonce).toBe(`sha256(${supaNonce})`);
    expect(appleNonce).not.toBe(supaNonce);
    expect(sb.auth.signInWithIdToken.mock.calls[0][0]).toMatchObject({ provider: 'apple', token: 'apple-id-token' });
  });

  it('cancelling Apple changes nothing', async () => {
    (Apple.signInAsync as jest.Mock).mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });
    expect(await auth.signInWithApple()).toEqual({ status: 'cancelled' });
    expect(sb.auth.signInWithIdToken).not.toHaveBeenCalled();
    expect(sb.rpc).not.toHaveBeenCalledWith('redeem_merge_ticket', expect.anything());
    expect(restoreFromAccount).not.toHaveBeenCalled();
    expect(await getPendingMergeTicket()).toBeNull();
  });

  it('a create_merge_ticket failure aborts before the Apple prompt', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
    const out = await auth.signInWithApple();
    expect(out.status).toBe('error');
    expect(Apple.signInAsync).not.toHaveBeenCalled();
    expect(sb.auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('an empty ticket response also aborts before the prompt', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: null });
    expect((await auth.signInWithApple()).status).toBe('error');
    expect(Apple.signInAsync).not.toHaveBeenCalled();
  });

  it('a failed redeem stores the ticket for retry and still restores', async () => {
    sb.rpc.mockImplementation(async (name: string) =>
      name === 'redeem_merge_ticket'
        ? { data: null, error: { message: 'network request failed' } }
        : { data: 'ticket-1', error: null }
    );
    const out = await auth.signInWithApple();
    expect(out.status).toBe('signedIn');
    expect(await getPendingMergeTicket()).toEqual({ ticket: 'ticket-1', from: 'anon-1' });
    expect(restoreFromAccount).toHaveBeenCalled();
  });

  it('a terminal redeem error clears the ticket', async () => {
    sb.rpc.mockImplementation(async (name: string) =>
      name === 'redeem_merge_ticket'
        ? { data: null, error: { message: 'ticket expired' } }
        : { data: 'ticket-1', error: null }
    );
    await auth.signInWithApple();
    expect(await getPendingMergeTicket()).toBeNull();
  });

  it('returns an error without prompting when not configured, offline, or already signed in', async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    expect((await auth.signInWithApple()).status).toBe('error');
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    setSession(null);
    expect((await auth.signInWithApple()).status).toBe('error');
    setSession(appleSession);
    expect(await auth.signInWithApple()).toEqual({ status: 'error', message: 'Already signed in.' });
    expect(Apple.signInAsync).not.toHaveBeenCalled();
  });

  it('errors when Apple returns no token or Supabase rejects it, without redeeming', async () => {
    (Apple.signInAsync as jest.Mock).mockResolvedValueOnce({ identityToken: null });
    expect((await auth.signInWithApple()).status).toBe('error');
    sb.auth.signInWithIdToken.mockResolvedValueOnce({ data: { session: null }, error: { message: 'bad' } });
    expect((await auth.signInWithApple()).status).toBe('error');
    expect(sb.rpc).not.toHaveBeenCalledWith('redeem_merge_ticket', expect.anything());
  });

  it('never throws on an unexpected Apple error', async () => {
    (Apple.signInAsync as jest.Mock).mockRejectedValue(new Error('weird'));
    expect((await auth.signInWithApple()).status).toBe('error');
  });
});

describe('retryPendingMergeTicket', () => {
  it('redeems a stored ticket for a signed-in session and clears it', async () => {
    setSession(appleSession);
    await setPendingMergeTicket('t9', 'anon-1');
    await auth.retryPendingMergeTicket();
    expect(sb.rpc).toHaveBeenCalledWith('redeem_merge_ticket', { ticket: 't9' });
    expect(await getPendingMergeTicket()).toBeNull();
  });

  it('keeps the ticket on a transient error', async () => {
    setSession(appleSession);
    await setPendingMergeTicket('t9', 'anon-1');
    sb.rpc.mockResolvedValue({ data: null, error: { message: 'timeout' } });
    await auth.retryPendingMergeTicket();
    expect(await getPendingMergeTicket()).toEqual({ ticket: 't9', from: 'anon-1' });
  });

  it('clears the ticket on a terminal error', async () => {
    setSession(appleSession);
    await setPendingMergeTicket('t9', 'anon-1');
    sb.rpc.mockResolvedValue({ data: null, error: { message: 'Ticket expired' } });
    await auth.retryPendingMergeTicket();
    expect(await getPendingMergeTicket()).toBeNull();
  });

  it('does nothing without a ticket, without a session, or for an anonymous session', async () => {
    setSession(appleSession);
    await auth.retryPendingMergeTicket();
    await setPendingMergeTicket('t9', 'other-anon');
    setSession(null);
    await auth.retryPendingMergeTicket();
    setSession(anonSession);
    await auth.retryPendingMergeTicket();
    expect(sb.rpc).not.toHaveBeenCalled();
    expect(await getPendingMergeTicket()).toEqual({ ticket: 't9', from: 'other-anon' });
  });

  it('a second redeem after a successful one is a no-op', async () => {
    setSession(appleSession);
    await setPendingMergeTicket('t9', 'anon-1');
    await auth.retryPendingMergeTicket();
    await auth.retryPendingMergeTicket();
    expect(sb.rpc.mock.calls.filter((c: unknown[]) => c[0] === 'redeem_merge_ticket')).toHaveLength(1);
  });

  it('never throws when the RPC rejects', async () => {
    setSession(appleSession);
    await setPendingMergeTicket('t9', 'anon-1');
    sb.rpc.mockRejectedValue(new Error('x'));
    await expect(auth.retryPendingMergeTicket()).resolves.toBeUndefined();
    expect(await getPendingMergeTicket()).toEqual({ ticket: 't9', from: 'anon-1' });
  });
});

describe('retryRestore', () => {
  it('fails when not signed in and restores for the session user otherwise', async () => {
    setSession(null);
    expect(await auth.retryRestore()).toEqual({ ok: false, error: 'Not signed in' });
    setSession(appleSession);
    await auth.retryRestore();
    expect(restoreFromAccount).toHaveBeenCalledWith('acct-1', undefined);
  });
});

describe('sign out', () => {
  it('countUnsynced adds logs, meals, names, goals and profile that lack synced_at', async () => {
    (db.getUnsyncedFoodLogs as jest.Mock).mockResolvedValueOnce([{}, {}]);
    (db.getUnsyncedMealDefinitions as jest.Mock).mockResolvedValueOnce([{}]);
    (db.getUnsyncedMealNames as jest.Mock).mockResolvedValueOnce([{}]);
    await saveUserGoals({ calorie_goal: 1, protein_goal: 1, carb_goal: 1, fat_goal: 1 });
    expect(await auth.countUnsynced()).toBe(5);
  });

  it('prepareSignOut syncs first and returns the unsynced count', async () => {
    (db.getUnsyncedFoodLogs as jest.Mock).mockResolvedValueOnce([{}]);
    expect(await auth.prepareSignOut()).toEqual({ unsynced: 1 });
    expect(syncToSupabase).toHaveBeenCalled();
  });

  it('signOutAndWipe signs out locally, wipes data and storage, cancels reminders and starts a new session', async () => {
    await AsyncStorage.setItem('onboarding_complete', 'true');
    setSession(appleSession);
    expect(await auth.signOutAndWipe()).toEqual({ ok: true });
    expect(sb.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(db.clearUserData).toHaveBeenCalled();
    expect(await AsyncStorage.getItem('onboarding_complete')).toBeNull();
    expect(restoreMealReminders).toHaveBeenCalled();
  });

  it('signOutAndWipe clears the rest timer and cancels rest notifications', async () => {
    const Notifications = require('expo-notifications');
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      { identifier: 'rest-timer:w1' },
      { identifier: 'meal-reminder:b' },
    ]);
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockClear();
    await AsyncStorage.setItem('active_rest_timer', JSON.stringify({ workoutId: 'w1', endsAt: Date.now() + 60000, durationSeconds: 60 }));
    setSession(appleSession);
    expect(await auth.signOutAndWipe()).toEqual({ ok: true });
    expect(await AsyncStorage.getItem('active_rest_timer')).toBeNull();
    expect((Notifications.cancelScheduledNotificationAsync as jest.Mock).mock.calls.map((c: any[]) => c[0])).toEqual(['rest-timer:w1']);
  });

  it('signOutAndWipe does not wipe when signOut returns an error', async () => {
    await AsyncStorage.setItem('onboarding_complete', 'true');
    sb.auth.signOut.mockResolvedValue({ error: { message: 'offline' } });
    expect((await auth.signOutAndWipe()).ok).toBe(false);
    expect(db.clearUserData).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem('onboarding_complete')).toBe('true');
  });

  it('signOutAndWipe does not wipe when signOut throws', async () => {
    sb.auth.signOut.mockRejectedValue(new Error('net'));
    expect((await auth.signOutAndWipe()).ok).toBe(false);
    expect(db.clearUserData).not.toHaveBeenCalled();
  });

  it('signOutAndWipe reports a failed wipe instead of rejecting, and keeps pendingWipe', async () => {
    (db.clearUserData as jest.Mock).mockRejectedValue(new Error('disk'));
    setSession(appleSession);
    sb.auth.signOut.mockImplementation(async () => {
      setSession(null);
      return { error: null };
    });
    const res = await auth.signOutAndWipe();
    expect(res.ok).toBe(false);
    expect(await getPendingWipe()).toBe(true);
    (db.clearUserData as jest.Mock).mockResolvedValue(undefined);
  });
});

describe('pending wipe', () => {
  it('initAuth finishes a pending wipe before creating a session or syncing', async () => {
    await AsyncStorage.setItem('pending_wipe', 'true');
    await AsyncStorage.setItem('onboarding_complete', 'true');
    setSession(null);
    const order: string[] = [];
    (db.clearUserData as jest.Mock).mockImplementationOnce(async () => { order.push('wipe'); });
    sb.auth.signInAnonymously.mockImplementationOnce(async () => {
      order.push('anon');
      return { data: { session: anonSession }, error: null };
    });
    await auth.initAuth();
    expect(order).toEqual(['wipe', 'anon']);
    expect(await getPendingWipe()).toBe(false);
    expect(await AsyncStorage.getItem('onboarding_complete')).toBeNull();
  });

  it('does not wipe when the flag is set but the user is still signed in', async () => {
    await AsyncStorage.setItem('pending_wipe', 'true');
    setSession(appleSession);
    await auth.initAuth();
    expect(db.clearUserData).not.toHaveBeenCalled();
    expect(await getPendingWipe()).toBe(false);
  });

  it('a failed signOut clears the flag', async () => {
    sb.auth.signOut.mockResolvedValue({ error: { message: 'offline' } });
    await auth.signOutAndWipe();
    expect(await getPendingWipe()).toBe(false);
  });
});

describe('auth transition flag', () => {
  const { isAuthTransitioning, resetAuthTransition } = require('@/lib/auth-transition');
  beforeEach(() => resetAuthTransition());

  it('is held during sign-in and released after a cancel', async () => {
    let during = false;
    (Apple.signInAsync as jest.Mock).mockImplementation(async () => {
      during = isAuthTransitioning();
      throw { code: 'ERR_REQUEST_CANCELED' };
    });
    await auth.signInWithApple();
    expect(during).toBe(true);
    expect(isAuthTransitioning()).toBe(false);
  });

  it('is released when sign-in throws', async () => {
    (Apple.signInAsync as jest.Mock).mockRejectedValue(new Error('x'));
    await auth.signInWithApple();
    expect(isAuthTransitioning()).toBe(false);
  });

  it('is held during sign-out and released when the wipe fails', async () => {
    let during = false;
    sb.auth.signOut.mockImplementation(async () => {
      during = isAuthTransitioning();
      return { error: null };
    });
    (db.clearUserData as jest.Mock).mockRejectedValueOnce(new Error('disk'));
    setSession(appleSession);
    await auth.signOutAndWipe();
    expect(during).toBe(true);
    expect(isAuthTransitioning()).toBe(false);
  });
});

describe('merge ticket persistence', () => {
  it('stores the ticket before signInWithIdToken', async () => {
    let atSignIn: unknown = 'unset';
    sb.auth.signInWithIdToken.mockImplementation(async () => {
      atSignIn = await getPendingMergeTicket();
      return { data: { session: appleSession, user: appleSession.user }, error: null };
    });
    await auth.signInWithApple();
    expect(atSignIn).toEqual({ ticket: 'ticket-1', from: 'anon-1' });
  });

  it('clears the ticket when Apple is cancelled or sign-in fails', async () => {
    (Apple.signInAsync as jest.Mock).mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });
    await auth.signInWithApple();
    expect(await getPendingMergeTicket()).toBeNull();
    (Apple.signInAsync as jest.Mock).mockResolvedValue({ identityToken: 't' });
    sb.auth.signInWithIdToken.mockResolvedValue({ data: { session: null }, error: { message: 'bad' } });
    await auth.signInWithApple();
    expect(await getPendingMergeTicket()).toBeNull();
  });

  it('drops an abandoned ticket when the same anonymous user is still signed in', async () => {
    await setPendingMergeTicket('t1', 'anon-1');
    setSession(anonSession);
    await auth.retryPendingMergeTicket();
    expect(await getPendingMergeTicket()).toBeNull();
  });

  it('invalid caller is final only for the anonymous user that made the ticket', () => {
    expect(auth.shouldDropTicket('invalid caller', anonSession as never, 'anon-1')).toBe(true);
    expect(auth.shouldDropTicket('invalid caller', anonSession as never, 'other')).toBe(false);
    expect(auth.shouldDropTicket('invalid caller', appleSession as never, 'anon-1')).toBe(false);
    expect(auth.shouldDropTicket('JWT expired', appleSession as never, 'anon-1')).toBe(false);
  });
});

describe('synced uid', () => {
  it('re-pushes everything when the user id changed without a merge', async () => {
    await setSyncedUid('old-uid');
    await auth.reconcileSyncedUid('new-uid');
    expect(db.markAllUnsynced).toHaveBeenCalledTimes(1);
    expect(await getSyncedUid()).toBe('new-uid');
    await auth.reconcileSyncedUid('new-uid');
    expect(db.markAllUnsynced).toHaveBeenCalledTimes(1);
  });

  it('only records the id the first time', async () => {
    await auth.reconcileSyncedUid('first');
    expect(db.markAllUnsynced).not.toHaveBeenCalled();
    expect(await getSyncedUid()).toBe('first');
  });

  it('a successful redeem records the new id without re-pushing', async () => {
    await setSyncedUid('anon-1');
    await auth.signInWithApple();
    expect(await getSyncedUid()).toBe('acct-1');
    await auth.reconcileSyncedUid('acct-1');
    expect(db.markAllUnsynced).not.toHaveBeenCalled();
  });

  it('a terminal redeem failure re-pushes the data to the account', async () => {
    sb.rpc.mockImplementation(async (name: string) =>
      name === 'redeem_merge_ticket'
        ? { data: null, error: { message: 'ticket expired' } }
        : { data: 'ticket-1', error: null }
    );
    await auth.signInWithApple();
    expect(db.markAllUnsynced).toHaveBeenCalled();
    expect(await getPendingMergeTicket()).toBeNull();
  });
});

describe('crash recovery after sign-in', () => {
  it('redeems the pending ticket, records the new uid first, skips resync and restores', async () => {
    const { isAuthTransitioning, resetAuthTransition } = require('@/lib/auth-transition');
    resetAuthTransition();
    await setSyncedUid('anon-1'); // killed before setSyncedUid(account)
    await setPendingMergeTicket('t5', 'anon-1');
    setSession(appleSession);
    let heldAtRestore = false;
    let uidAtRestore: string | null = null;
    (restoreFromAccount as jest.Mock).mockImplementationOnce(async () => {
      heldAtRestore = isAuthTransitioning();
      uidAtRestore = await getSyncedUid();
      return { ok: true, logsRestored: 0, unresolvedFoods: 0, mealsRestored: false, goalsRestored: true };
    });

    await auth.retryPendingMergeTicket();
    expect(sb.rpc).toHaveBeenCalledWith('redeem_merge_ticket', { ticket: 't5' });
    expect(uidAtRestore).toBe('acct-1');
    expect(heldAtRestore).toBe(true);
    expect(isAuthTransitioning()).toBe(false);
    expect(restoreFromAccount).toHaveBeenCalledWith('acct-1', undefined);

    await auth.reconcileSyncedUid('acct-1');
    expect(db.markAllUnsynced).not.toHaveBeenCalled();
    expect(await getPendingMergeTicket()).toBeNull();
  });
});


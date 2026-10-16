import * as Crypto from 'expo-crypto';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { isSyncConfigured } from '@/lib/sync-status';
import { getDeviceId } from '@/lib/device-id';
import { beginAuthTransition } from '@/lib/auth-transition';
import {
  clearUserData,
  markAllUnsynced,
  getUnsyncedFoodLogs,
  getUnsyncedMealDefinitions,
  getUnsyncedMealNames,
} from '@/lib/database';
import {
  clearGoalsProfileSyncFlags,
  clearPendingMergeTicket,
  clearPendingWipe,
  clearUserStorage,
  getPendingWipe,
  getSyncedUid,
  setPendingWipe,
  setRestorePending,
  setSyncedUid,
  getLegacyClaimed,
  getOnboardingComplete,
  getPendingMergeTicket,
  getUserGoals,
  getUserProfile,
  setLegacyClaimed,
  setPendingMergeTicket,
} from '@/lib/storage';
import { restoreFromAccount, type RestoreProgress, type RestoreResult } from '@/lib/restore';
import { restoreMealReminders } from '@/lib/reminders';
import type { AuthState, AuthStatus } from '@/lib/types';

// lib/sync.ts imports this file, so sync is loaded lazily to avoid an import cycle.
function triggerSync(): void {
  import('@/lib/sync').then((m) => m.syncToSupabase()).catch(() => {});
}

async function syncNowAndWait(): Promise<void> {
  const m = await import('@/lib/sync');
  await m.syncToSupabase();
}

async function waitForSyncIdle(): Promise<void> {
  const m = await import('@/lib/sync');
  await m.waitForSyncIdle();
}

/** Marks everything unsynced so the next sync pushes it all to the current user. */
export async function markAllForResync(): Promise<void> {
  await markAllUnsynced();
  await clearGoalsProfileSyncFlags();
}

/**
 * Called by sync with the session user id. If the data was last synced under a different
 * user (and not through a merge ticket, which records the new id itself), re-push everything.
 */
export async function reconcileSyncedUid(userId: string): Promise<void> {
  try {
    const last = await getSyncedUid();
    if (last === userId) return;
    if (last) await markAllForResync();
    await setSyncedUid(userId);
  } catch {
    // Retry on the next pass.
  }
}

/** Restore with a persisted "pending" marker so a failure can be retried later. */
async function restoreTracked(
  userId: string,
  onProgress?: (p: RestoreProgress) => void
): Promise<RestoreResult> {
  await setRestorePending(true).catch(() => {});
  const result = await restoreFromAccount(userId, onProgress);
  if (result.ok) await setRestorePending(false).catch(() => {});
  return result;
}

/** Local half of sign-out: empties user data. Safe to run again. */
async function finishWipe(): Promise<void> {
  await clearUserData();
  await clearUserStorage();
  await restoreMealReminders(); // reseeded meals have no reminders, so this cancels them all
  await clearPendingWipe();
}

// ── Pure ────────────────────────────────────────────────────────

export function deriveAuthState(session: Session | null): AuthState {
  if (!session) return { status: 'none', email: null };
  const user = session.user;
  const status: AuthStatus = user.is_anonymous ? 'anonymous' : 'signedIn';
  return { status, email: status === 'signedIn' ? (user.email ?? null) : null };
}

/** Apple reports a cancelled sheet with this code. */
export function isAppleCancel(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'ERR_REQUEST_CANCELED';
}

const TERMINAL_TICKET_ERRORS = new Set(['invalid ticket', 'ticket expired', 'invalid caller']);

/**
 * Redeem errors that will never succeed on retry (the exact messages the SQL raises). Auth
 * errors such as 'not authenticated', 'JWT expired' and network failures are retryable.
 */
export function isTerminalTicketError(message: string): boolean {
  return TERMINAL_TICKET_ERRORS.has(message.trim().toLowerCase());
}

// ── Session ─────────────────────────────────────────────────────

async function getSession(): Promise<Session | null> {
  if (!isSyncConfigured()) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session ?? null;
  } catch {
    return null;
  }
}

/** Current Supabase user id (text form stored in `user_id` columns), or null with no session. */
export async function getSessionUserId(): Promise<string | null> {
  return (await getSession())?.user.id ?? null;
}

export async function getAuthState(): Promise<AuthState> {
  return deriveAuthState(await getSession());
}

// ── Legacy device data ──────────────────────────────────────────

/** Moves rows stored under the old device UUID to the current user. Idempotent server side. */
async function claimLegacyData(): Promise<void> {
  if (await getLegacyClaimed()) return;
  try {
    const deviceId = await getDeviceId();
    const { error } = await supabase.rpc('claim_device_data', { p_device_id: deviceId });
    if (error) return; // try again next launch
    await setLegacyClaimed();
  } catch {
    // Offline: try again next launch.
  }
}

// ── Merge tickets ───────────────────────────────────────────────

/**
 * Whether a redeem failure is final. 'invalid caller' also means "you are still the anonymous
 * user", which is only final when that user made the ticket (an abandoned sign-in); for anyone
 * else it may be a stale token and is retried.
 */
export function shouldDropTicket(
  message: string,
  session: Pick<Session, 'user'> | null,
  from: string
): boolean {
  if (message.trim().toLowerCase() === 'invalid caller') {
    return Boolean(session?.user.is_anonymous && session.user.id === from);
  }
  return isTerminalTicketError(message);
}

/**
 * Redeems a ticket left over from an interrupted sign-in. Redeeming twice is a no-op on the
 * server, so this is safe to call whenever. A ticket that can never be redeemed is dropped and
 * the local data is re-pushed to the current user so nothing stays stranded under the old one.
 * Never throws.
 */
export async function retryPendingMergeTicket(): Promise<void> {
  try {
    const pending = await getPendingMergeTicket();
    if (!pending) return;
    const session = await getSession();
    if (!session) return;
    if (session.user.is_anonymous) {
      // Still the user that made the ticket: the sign-in never happened, so it is unused.
      if (session.user.id === pending.from) await clearPendingMergeTicket();
      return;
    }
    // Held until the new uid is recorded and the restore is done, so no pass can see the
    // old uid and re-push local data over the account (the account's data wins).
    const release = beginAuthTransition();
    try {
      const { error } = await supabase.rpc('redeem_merge_ticket', { ticket: pending.ticket });
      if (!error) {
        await clearPendingMergeTicket();
        await setSyncedUid(session.user.id);
        // The sign-in was interrupted before its restore ran; do what it would have done.
        await restoreTracked(session.user.id);
        return;
      }
      if (shouldDropTicket(error.message ?? '', session, pending.from)) {
        await clearPendingMergeTicket();
        await markAllForResync();
      }
    } finally {
      release();
    }
  } catch {
    // Keep the ticket for the next attempt.
  }
}

// ── initAuth ────────────────────────────────────────────────────

export type InitAuthResult = { status: AuthStatus; restored: boolean };

let initInFlight: Promise<InitAuthResult> | null = null;

/** Finishes a sign-out whose wipe did not complete, before anything can sync. */
async function resumePendingWipe(): Promise<void> {
  if (!(await getPendingWipe())) return;
  const session = await getSession();
  if (session && !session.user.is_anonymous) {
    // signOut never happened (interrupted before it); nothing to wipe.
    await clearPendingWipe();
    return;
  }
  const release = beginAuthTransition();
  try {
    await finishWipe();
  } finally {
    release();
  }
}

async function runInitAuth(): Promise<InitAuthResult> {
  await resumePendingWipe();
  if (!isSyncConfigured()) return { status: 'none', restored: false };

  let session = await getSession();
  if (!session) {
    try {
      const { data } = await supabase.auth.signInAnonymously();
      session = data.session ?? null;
    } catch {
      session = null;
    }
  }
  if (!session) return { status: 'none', restored: false };

  await claimLegacyData();
  await retryPendingMergeTicket();

  const state = deriveAuthState(session);
  let restored = false;
  // A Keychain session can survive a reinstall while local data does not.
  if (state.status === 'signedIn' && !(await getOnboardingComplete())) {
    const result = await restoreTracked(session.user.id);
    restored = result.ok && result.goalsRestored;
  }

  triggerSync();
  return { status: state.status, restored };
}

/**
 * Makes sure the app has a Supabase session (anonymous if nobody signed in), finishes any
 * interrupted sign-out wipe, claims legacy device data once, redeems any pending merge ticket,
 * auto-restores when a signed-in session meets an empty install, then triggers a sync.
 * Never throws; concurrent calls share one run.
 */
export function initAuth(): Promise<InitAuthResult> {
  initInFlight ??= runInitAuth()
    .catch((): InitAuthResult => ({ status: 'none', restored: false }))
    .finally(() => {
      initInFlight = null;
    });
  return initInFlight;
}

// ── Sign in with Apple ──────────────────────────────────────────

export type SignInOutcome =
  | { status: 'signedIn'; restore: RestoreResult }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

const sha256 = (value: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);

/**
 * Signs in with Apple from the anonymous session, carrying that session's rows into the
 * account, then restores the account's data onto the device. One Apple prompt.
 * Nothing changes if the user cancels or if the merge ticket cannot be created.
 * Sync is suspended from before the ticket is created until the restore finishes.
 */
export async function signInWithApple(
  onProgress?: (p: RestoreProgress) => void
): Promise<SignInOutcome> {
  let release: (() => void) | null = null;
  let ticketStored = false;
  let signedIn = false;
  try {
    if (!isSyncConfigured()) return { status: 'error', message: 'Sign-in is not available.' };

    const before = await getSession();
    if (!before) {
      return { status: 'error', message: 'No connection to the server. Try again when online.' };
    }
    if (!before.user.is_anonymous) return { status: 'error', message: 'Already signed in.' };

    // Push local rows to the anonymous user first so the merge carries them, then make sure
    // no pass is still running before sync is suspended.
    await syncNowAndWait();
    release = beginAuthTransition();
    await waitForSyncIdle();

    const { data: ticketData, error: ticketError } = await supabase.rpc('create_merge_ticket');
    if (ticketError || !ticketData) {
      return { status: 'error', message: 'Could not start sign-in. Try again when online.' };
    }
    const ticket = String(ticketData);
    await setPendingMergeTicket(ticket, before.user.id);
    ticketStored = true;

    const rawNonce = `${Crypto.randomUUID()}${Crypto.randomUUID()}`;
    const hashedNonce = await sha256(rawNonce);

    // Loaded lazily: the native module only exists on iOS.
    const AppleAuthentication = await import('expo-apple-authentication');
    let identityToken: string | null;
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      identityToken = credential.identityToken;
    } catch (e) {
      if (isAppleCancel(e)) return { status: 'cancelled' };
      throw e;
    }
    if (!identityToken) return { status: 'error', message: 'Apple did not return a sign-in token.' };

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: identityToken,
      nonce: rawNonce,
    });
    if (error || !data.session) {
      return { status: 'error', message: 'Sign-in failed. Try again.' };
    }
    signedIn = true;

    // Rows now belong to the account (or will once the ticket is redeemed), so a changed user
    // id must not make sync treat them as someone else's.
    await setSyncedUid(data.session.user.id);
    const { error: redeemError } = await supabase.rpc('redeem_merge_ticket', { ticket });
    if (!redeemError) {
      await clearPendingMergeTicket();
    } else if (shouldDropTicket(redeemError.message ?? '', data.session, before.user.id)) {
      await clearPendingMergeTicket();
      await markAllForResync();
    }

    const restore = await restoreTracked(data.session.user.id, onProgress);
    return { status: 'signedIn', restore };
  } catch {
    return { status: 'error', message: 'Sign-in failed. Try again.' };
  } finally {
    // The ticket belongs to a sign-in that did not happen: drop it.
    if (ticketStored && !signedIn) await clearPendingMergeTicket().catch(() => {});
    release?.();
    triggerSync();
  }
}

/** Re-runs the restore for the signed-in account (retry after a failed restore). */
export async function retryRestore(
  onProgress?: (p: RestoreProgress) => void
): Promise<RestoreResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: 'Not signed in' };
  const release = beginAuthTransition();
  try {
    await waitForSyncIdle();
    return await restoreTracked(userId, onProgress);
  } finally {
    release();
    triggerSync();
  }
}

// ── Sign out ────────────────────────────────────────────────────

/** Rows on the device that the account does not have yet. */
export async function countUnsynced(): Promise<number> {
  const [logs, defs, names, goals, profile] = await Promise.all([
    getUnsyncedFoodLogs(),
    getUnsyncedMealDefinitions(),
    getUnsyncedMealNames(),
    getUserGoals(),
    getUserProfile(),
  ]);
  return logs.length + defs.length + names.length + (goals && !goals.synced_at ? 1 : 0) + (profile && !profile.synced_at ? 1 : 0);
}

/** Step 1 of sign-out: one last sync attempt, then the count the confirm dialog warns about. */
export async function prepareSignOut(): Promise<{ unsynced: number }> {
  await syncNowAndWait();
  return { unsynced: await countUnsynced() };
}

export type SignOutResult = { ok: true } | { ok: false; message: string };

/**
 * Signs out this device only, wipes the local user data and starts a fresh anonymous session.
 * The caller shows the confirmation first and navigates to onboarding afterwards. Never
 * rejects. If the sign-out request fails nothing is wiped. If the wipe fails after the
 * sign-out, a persisted flag makes the next initAuth finish it before any sync.
 */
export async function signOutAndWipe(): Promise<SignOutResult> {
  const release = beginAuthTransition();
  let signedOut = false;
  let result: SignOutResult = { ok: true };
  try {
    await waitForSyncIdle();
    await setPendingWipe();
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      await clearPendingWipe();
      result = { ok: false, message: 'Could not sign out. Try again when online.' };
    } else {
      signedOut = true;
      await finishWipe();
    }
  } catch {
    if (!signedOut) {
      await clearPendingWipe().catch(() => {});
      result = { ok: false, message: 'Could not sign out. Try again when online.' };
    } else {
      result = {
        ok: false,
        message: 'Signed out, but data on this device could not be cleared. It will be cleared when you reopen the app.',
      };
    }
  } finally {
    release();
  }
  if (signedOut) await initAuth(); // retries an unfinished wipe, then starts a new anonymous session
  return result;
}

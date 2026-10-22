import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { isSyncConfigured } from '@/lib/sync-status';
import { getDeviceId } from '@/lib/device-id';
import { beginAuthTransition, isAuthTransitioning } from '@/lib/auth-transition';
import {
  clearPendingMergeTicket,
  setSyncedUid,
  getLegacyClaimed,
  getOnboardingComplete,
  getPendingMergeTicket,
  setLegacyClaimed,
  setPendingMergeTicket,
} from '@/lib/storage';
import { hasRestoredData, type RestoreProgress, type RestoreResult } from '@/lib/restore';
import { reportAuthIssue } from '@/lib/auth-debug';
import type { AuthStatus } from '@/lib/types';
import {
  triggerSync,
  syncNowAndWait,
  waitForSyncIdle,
  markAllForResync,
  restoreTracked,
  deriveAuthState,
  isTerminalTicketError,
  getSession,
  getSessionUserId,
  ACCOUNT_DELETION_KEY,
} from '@/lib/auth-session';
import { resumePendingWipe, resumeAccountDeletion } from '@/lib/auth-wipe';

/** Moves rows stored under the old device UUID to the current user. Idempotent server side. */
async function claimLegacyData(): Promise<void> {
  if (await getLegacyClaimed()) return;
  try {
    const deviceId = await getDeviceId();
    const { error } = await supabase.rpc('claim_device_data', { p_device_id: deviceId });
    if (error) {
      reportAuthIssue('claimLegacyData', error);
      return; // try again next launch
    }
    await setLegacyClaimed();
  } catch (e) {
    reportAuthIssue('claimLegacyData', e);
    // Offline: try again next launch.
  }
}

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
    if (isAuthTransitioning()) return;
    const release = beginAuthTransition();
    try {
      await waitForSyncIdle();
      const { error } = await supabase.rpc('redeem_merge_ticket', { ticket: pending.ticket });
      if (!error) {
        await clearPendingMergeTicket();
        await setSyncedUid(session.user.id);
        // The sign-in was interrupted before its restore ran; do what it would have done.
        await restoreTracked(session.user.id);
        return;
      }
      reportAuthIssue('retryPendingMergeTicket', error);
      if (shouldDropTicket(error.message ?? '', session, pending.from)) {
        await clearPendingMergeTicket();
        await markAllForResync();
      }
    } finally {
      release();
    }
  } catch (e) {
    reportAuthIssue('retryPendingMergeTicket', e);
    // Keep the ticket for the next attempt.
  }
}

export type InitAuthResult = { status: AuthStatus; restored: boolean };

let initInFlight: Promise<InitAuthResult> | null = null;

/** Minimum gap between failed anonymous sign-in attempts (the server allows ~30/hour/IP). */
export const ANON_SIGN_IN_COOLDOWN_MS = 30_000;

/** getUser can hang on a bad connection; treat a hang as transient. */
export const VALIDATE_SESSION_TIMEOUT_MS = 5_000;

const STALE_SESSION_CODES = new Set(['user_not_found', 'session_not_found', 'bad_jwt']);

let lastAnonFailureAt = 0;
let sessionValidated = false;
let mergeInFlight = false;

/** Test helper. */
export function resetAuthRuntimeState(): void {
  mergeInFlight = false;
  lastAnonFailureAt = 0;
  sessionValidated = false;
}

/**
 * Whether a merge sign-in or an initAuth run is in flight. Sign-out and account deletion live
 * in their own files, so they read the flags through this instead of the module variables.
 */
export function isAccountOperationInFlight(): boolean {
  return mergeInFlight || initInFlight !== null;
}

/**
 * Checks a restored session against the server once per launch. A stale anonymous session
 * (its user was deleted) is dropped so a fresh one is created; a stale signed-in session is
 * only reported, never wiped.
 */
async function validateSession(session: Session): Promise<Session | null> {
  if (sessionValidated) return session;
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), VALIDATE_SESSION_TIMEOUT_MS);
    });
    const raced = await Promise.race([supabase.auth.getUser(), timeout]).finally(() =>
      clearTimeout(timer)
    );
    if (raced === 'timeout') {
      reportAuthIssue('validateSession', 'timed out');
      return session; // transient: keep the session, validate on a later initAuth
    }
    const { error } = raced;
    if (!error) {
      sessionValidated = true;
      return session;
    }
    reportAuthIssue('validateSession', error);
    const code = (error as { code?: string }).code ?? '';
    if (!STALE_SESSION_CODES.has(code)) return session; // offline or transient: retry later
    sessionValidated = true;
    if (!session.user.is_anonymous) return session;
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    return null;
  } catch (e) {
    reportAuthIssue('validateSession', e);
    return session;
  }
}

async function runInitAuth(force: boolean): Promise<InitAuthResult> {
  if (isAuthTransitioning() || mergeInFlight) return { status: 'none', restored: false };
  await resumeAccountDeletion();
  await resumePendingWipe();
  if (!isSyncConfigured()) return { status: 'none', restored: false };

  let session = await getSession();
  if (session) session = await validateSession(session);
  if (!session) {
    if (!force && Date.now() - lastAnonFailureAt < ANON_SIGN_IN_COOLDOWN_MS) {
      return { status: 'none', restored: false };
    }
    try {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) reportAuthIssue('signInAnonymously', error);
      session = data?.session ?? null;
    } catch (e) {
      reportAuthIssue('signInAnonymously', e);
      session = null;
    }
    lastAnonFailureAt = session ? 0 : Date.now();
  }
  if (!session) return { status: 'none', restored: false };

  await claimLegacyData();
  await retryPendingMergeTicket();

  const state = deriveAuthState(session);
  let restored = false;
  // A Keychain session can survive a reinstall while local data does not.
  if (state.status === 'signedIn' && !(await getOnboardingComplete())) {
    const result = await restoreTracked(session.user.id);
    restored = result.ok && hasRestoredData(result);
  }

  triggerSync();
  return { status: state.status, restored };
}

/**
 * Makes sure the app has a Supabase session (anonymous if nobody signed in), finishes any
 * interrupted sign-out wipe, claims legacy device data once, redeems any pending merge ticket,
 * auto-restores when a signed-in session meets an empty install, then triggers a sync.
 * Failed anonymous sign-ins are throttled to one per 30 s unless `force` (a user action).
 * Never throws; concurrent calls share one run.
 */
export function initAuth(options: { force?: boolean } = {}): Promise<InitAuthResult> {
  initInFlight ??= runInitAuth(Boolean(options.force))
    .catch((e): InitAuthResult => {
      reportAuthIssue('initAuth', e);
      return { status: 'none', restored: false };
    })
    .finally(() => {
      initInFlight = null;
    });
  return initInFlight;
}

/** The current session, creating an anonymous one first if there is none. Null when offline. */
export async function ensureSession(): Promise<Session | null> {
  if (!isSyncConfigured()) return null;
  const existing = await getSession();
  if (existing) return existing;
  await initAuth({ force: true });
  return getSession();
}

export type SignInOutcome =
  | { status: 'signedIn'; restore: RestoreResult; warning?: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/** What a sign-in method hands back once the user has been authenticated. */
export type ObtainResult =
  | { session: Session }
  | { cancelled: true }
  | { error: string };

export const SIGN_IN_FAILED = 'Sign-in failed. Try again.';

/**
 * Signs in from the anonymous session through `obtainSession`, carrying that session's rows
 * into the account, then restores the account's data onto the device.
 * Nothing changes if the user cancels, if obtaining the session fails, or if the merge ticket
 * cannot be created. Sync is suspended from before the ticket is created until the restore
 * finishes. `obtainSession` runs after the ticket is stored.
 */
export async function signInWithMerge(
  obtainSession: () => Promise<ObtainResult>,
  onProgress?: (p: RestoreProgress) => void
): Promise<SignInOutcome> {
  // One sign-in at a time: two concurrent calls would create two tickets.
  if (mergeInFlight || isAuthTransitioning()) return { status: 'error', message: 'Sign-in is already in progress.' };
  mergeInFlight = true;
  try {
    return await runSignInWithMerge(obtainSession, onProgress);
  } finally {
    mergeInFlight = false;
  }
}

async function runSignInWithMerge(
  obtainSession: () => Promise<ObtainResult>,
  onProgress?: (p: RestoreProgress) => void
): Promise<SignInOutcome> {
  let release: (() => void) | null = null;
  let ticketStored = false;
  let signedIn = false;
  try {
    if (await AsyncStorage.getItem(ACCOUNT_DELETION_KEY)) return { status: 'error', message: 'Finish account deletion before signing in.' };
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
      if (ticketError) reportAuthIssue('create_merge_ticket', ticketError);
      return { status: 'error', message: 'Could not start sign-in. Try again when online.' };
    }
    const ticket = String(ticketData);
    await setPendingMergeTicket(ticket, before.user.id);
    ticketStored = true;

    const obtained = await obtainSession();
    if ('cancelled' in obtained) return { status: 'cancelled' };
    if ('error' in obtained) return { status: 'error', message: obtained.error };
    const session = obtained.session;
    signedIn = true;

    // Rows now belong to the account (or will once the ticket is redeemed), so a changed user
    // id must not make sync treat them as someone else's.
    await setSyncedUid(session.user.id);
    if (session.user.id === before.user.id) {
      // Same user (an interrupted in-place sign-up): nothing to merge, never redeem X -> X.
      await clearPendingMergeTicket();
      const restore = await restoreTracked(session.user.id, onProgress);
      return { status: 'signedIn', restore };
    }
    const { error: redeemError } = await supabase.rpc('redeem_merge_ticket', { ticket });
    if (!redeemError) {
      await clearPendingMergeTicket();
    } else {
      reportAuthIssue('redeem_merge_ticket', redeemError);
      if (shouldDropTicket(redeemError.message ?? '', session, before.user.id)) {
        await clearPendingMergeTicket();
        await markAllForResync();
      }
    }

    const restore = await restoreTracked(session.user.id, onProgress);
    return { status: 'signedIn', restore };
  } catch (e) {
    reportAuthIssue('signInWithMerge', e);
    return { status: 'error', message: SIGN_IN_FAILED };
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
  if (isAuthTransitioning() || mergeInFlight || initInFlight) return { ok: false, error: 'Another account operation is in progress.' };
  const release = beginAuthTransition();
  try {
    const userId = await getSessionUserId();
    if (!userId) return { ok: false, error: 'Not signed in' };
    await waitForSyncIdle();
    return await restoreTracked(userId, onProgress);
  } finally {
    release();
    triggerSync();
  }
}


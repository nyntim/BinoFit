import { reloadPreferences } from '@/lib/app-preferences';
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
import { hasRestoredData, restoreFromAccount, type RestoreProgress, type RestoreResult } from '@/lib/restore';
import { restoreMealReminders } from '@/lib/reminders';
import { clearRestTimerAndNotifications } from '@/lib/workouts/rest-timer-store';
import { reportAuthIssue } from '@/lib/auth-debug';
import { authErrorMessage, normalizeEmail } from '@/lib/auth-validation';
import type { AuthMethod, AuthState, AuthStatus } from '@/lib/types';

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
  else reportAuthIssue('restore', result.error);
  return result;
}

/** Local half of sign-out: empties user data. Safe to run again. */
async function finishWipe(): Promise<void> {
  await clearRestTimerAndNotifications(); // forget the rest timer and cancel its notification
  await clearUserData();
  await clearUserStorage();
  await reloadPreferences(); // tracking mode was cleared; refresh the in-memory copy
  await restoreMealReminders(); // reseeded meals have no reminders, so this cancels them all
  await clearPendingWipe();
}

// ── Pure ────────────────────────────────────────────────────────

export function deriveAuthState(session: Session | null): AuthState {
  if (!session) return { status: 'none', email: null, method: null };
  const user = session.user;
  const status: AuthStatus = user.is_anonymous ? 'anonymous' : 'signedIn';
  return {
    status,
    email: status === 'signedIn' ? (user.email ?? null) : null,
    method: status === 'signedIn' ? methodFromUser(user) : null,
  };
}

/** Sign-in method from the provider list Supabase keeps in app_metadata. */
export function methodFromUser(user: Pick<Session['user'], 'app_metadata'>): AuthMethod | null {
  const meta = (user.app_metadata ?? {}) as { providers?: unknown; provider?: unknown };
  const providers: string[] = Array.isArray(meta.providers)
    ? meta.providers.filter((p): p is string => typeof p === 'string')
    : typeof meta.provider === 'string'
      ? [meta.provider]
      : [];
  if (providers.includes('apple')) return 'apple';
  if (providers.includes('email')) return 'email';
  return null;
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

// ── Sign in (merge) ─────────────────────────────────────────────

export type SignInOutcome =
  | { status: 'signedIn'; restore: RestoreResult; warning?: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/** What a sign-in method hands back once the user has been authenticated. */
export type ObtainResult =
  | { session: Session }
  | { cancelled: true }
  | { error: string };

const SIGN_IN_FAILED = 'Sign-in failed. Try again.';

const sha256 = (value: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);

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
  if (mergeInFlight) return { status: 'error', message: 'Sign-in is already in progress.' };
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

/** Signs in with Apple from the anonymous session. One Apple prompt. */
export async function signInWithApple(
  onProgress?: (p: RestoreProgress) => void
): Promise<SignInOutcome> {
  return signInWithMerge(async () => {
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
      if (isAppleCancel(e)) return { cancelled: true };
      throw e;
    }
    if (!identityToken) return { error: 'Apple did not return a sign-in token.' };

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: identityToken,
      nonce: rawNonce,
    });
    if (error || !data.session) {
      if (error) reportAuthIssue('signInWithIdToken', error);
      return { error: SIGN_IN_FAILED };
    }
    return { session: data.session };
  }, onProgress);
}

// ── Email + password ────────────────────────────────────────────

const OFFLINE_MESSAGE = "You're offline. Connect and try again.";

export type EmailSignUpOutcome =
  | { status: 'signedUp' }
  | { status: 'confirmEmail'; email: string }
  | { status: 'error'; message: string };

/**
 * Creates an email account by converting the current anonymous user in place: the user id
 * stays the same, so there is no merge ticket, no restore and no sync transition. With
 * "Confirm email" on, the server waits for a 6-digit code (see verifyEmailCode).
 */
export async function signUpWithEmail(email: string, password: string): Promise<EmailSignUpOutcome> {
  try {
    if (!isSyncConfigured()) return { status: 'error', message: 'Sign-up is not available.' };
    const session = await ensureSession();
    if (!session) return { status: 'error', message: OFFLINE_MESSAGE };
    if (!session.user.is_anonymous) return { status: 'error', message: 'Already signed in.' };

    const address = normalizeEmail(email);
    const { data, error } = await supabase.auth.updateUser({ email: address, password });
    if (error) {
      reportAuthIssue('signUpWithEmail', error);
      return { status: 'error', message: authErrorMessage(error) };
    }
    if (data.user?.new_email) return { status: 'confirmEmail', email: address };
    return await finishConversion(session.user.id);
  } catch (e) {
    reportAuthIssue('signUpWithEmail', e);
    return { status: 'error', message: authErrorMessage(e) };
  }
}

/** Refreshes the session so is_anonymous reflects the conversion, then re-syncs. */
async function finishConversion(expectedUid: string): Promise<EmailSignUpOutcome> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    reportAuthIssue('refreshSession', error);
    return { status: 'error', message: authErrorMessage(error) };
  }
  const user = data.session?.user;
  if (!user || user.is_anonymous) {
    reportAuthIssue('refreshSession', 'user is still anonymous after sign-up');
    return { status: 'error', message: 'Could not finish creating the account. Try again.' };
  }
  // The id is the same, so this is normally a no-op; it only matters if it ever differs.
  if (user.id !== expectedUid) await setSyncedUid(user.id);
  triggerSync();
  return { status: 'signedUp' };
}

/** Second step of sign-up when email confirmation is required. */
export async function verifyEmailCode(email: string, code: string): Promise<EmailSignUpOutcome> {
  try {
    const session = await getSession();
    const { error } = await supabase.auth.verifyOtp({
      email: normalizeEmail(email),
      token: code.trim(),
      type: 'email_change',
    });
    if (error) {
      reportAuthIssue('verifyEmailCode', error);
      return { status: 'error', message: authErrorMessage(error) };
    }
    return await finishConversion(session?.user.id ?? '');
  } catch (e) {
    reportAuthIssue('verifyEmailCode', e);
    return { status: 'error', message: authErrorMessage(e) };
  }
}

/** Resends the confirmation code for a pending sign-up email. */
export async function resendEmailCode(
  email: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { error } = await supabase.auth.resend({ type: 'email_change', email: normalizeEmail(email) });
    if (error) {
      reportAuthIssue('resendEmailCode', error);
      return { ok: false, message: authErrorMessage(error) };
    }
    return { ok: true };
  } catch (e) {
    reportAuthIssue('resendEmailCode', e);
    return { ok: false, message: authErrorMessage(e) };
  }
}

/** Signs in to an existing email account, merging this device's anonymous data into it. */
export async function signInWithEmail(
  email: string,
  password: string,
  onProgress?: (p: RestoreProgress) => void
): Promise<SignInOutcome> {
  if (!(await ensureSession())) return { status: 'error', message: OFFLINE_MESSAGE };
  return signInWithMerge(async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    if (error || !data.session) {
      if (error) reportAuthIssue('signInWithPassword', error);
      return { error: error ? authErrorMessage(error) : SIGN_IN_FAILED };
    }
    return { session: data.session };
  }, onProgress);
}

/** Emails a 6-digit recovery code. */
export async function requestPasswordReset(
  email: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email));
    if (error) {
      reportAuthIssue('requestPasswordReset', error);
      return { ok: false, message: authErrorMessage(error) };
    }
    return { ok: true };
  } catch (e) {
    reportAuthIssue('requestPasswordReset', e);
    return { ok: false, message: authErrorMessage(e) };
  }
}

/**
 * Finishes a password reset: the recovery code signs the user in (so the anonymous data
 * merges like any other sign-in), then the new password is set.
 */
export async function verifyPasswordReset(
  email: string,
  code: string,
  newPassword: string,
  onProgress?: (p: RestoreProgress) => void
): Promise<SignInOutcome> {
  if (!(await ensureSession())) return { status: 'error', message: OFFLINE_MESSAGE };
  const outcome = await signInWithMerge(async () => {
    const { data, error } = await supabase.auth.verifyOtp({
      email: normalizeEmail(email),
      token: code.trim(),
      type: 'recovery',
    });
    if (error || !data.session) {
      if (error) reportAuthIssue('verifyPasswordReset', error);
      return { error: error ? authErrorMessage(error) : SIGN_IN_FAILED };
    }
    return { session: data.session };
  }, onProgress);
  if (outcome.status !== 'signedIn') return outcome;
  const result = await changePassword(newPassword);
  if (!result.ok) {
    return { ...outcome, warning: `Signed in, but the password was not changed. ${result.message}` };
  }
  return outcome;
}

/** Sets a new password for the signed-in user. */
export async function changePassword(
  newPassword: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const session = await getSession();
    if (!session || session.user.is_anonymous || methodFromUser(session.user) !== 'email') {
      return { ok: false, message: 'Password change is only available for email accounts.' };
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      reportAuthIssue('changePassword', error);
      return { ok: false, message: authErrorMessage(error) };
    }
    return { ok: true };
  } catch (e) {
    reportAuthIssue('changePassword', e);
    return { ok: false, message: authErrorMessage(e) };
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
  if (signedOut) await initAuth({ force: true }); // retries an unfinished wipe, then starts a new anonymous session
  return result;
}

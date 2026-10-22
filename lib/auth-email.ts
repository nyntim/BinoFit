import { supabase } from '@/lib/supabase';
import { isSyncConfigured } from '@/lib/sync-status';
import { setSyncedUid } from '@/lib/storage';
import type { RestoreProgress } from '@/lib/restore';
import { reportAuthIssue } from '@/lib/auth-debug';
import { authErrorMessage, normalizeEmail } from '@/lib/auth-validation';
import { triggerSync, methodFromUser, getSession } from '@/lib/auth-session';
import { ensureSession, type SignInOutcome, SIGN_IN_FAILED, signInWithMerge } from '@/lib/auth-init';

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

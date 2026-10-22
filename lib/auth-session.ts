import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { isSyncConfigured } from '@/lib/sync-status';
import { markAllUnsynced } from '@/lib/database';
import {
  clearGoalsProfileSyncFlags,
  getSyncedUid,
  setRestorePending,
  setSyncedUid,
} from '@/lib/storage';
import { restoreFromAccount, type RestoreProgress, type RestoreResult } from '@/lib/restore';
import { reportAuthIssue } from '@/lib/auth-debug';
import type { AuthMethod, AuthState, AuthStatus } from '@/lib/types';

// lib/sync.ts imports the auth API (and so this file); sync is loaded lazily to avoid an import cycle.
export function triggerSync(): void {
  import('@/lib/sync').then((m) => m.syncToSupabase()).catch(() => {});
}

export async function syncNowAndWait(): Promise<void> {
  const m = await import('@/lib/sync');
  await m.syncToSupabase();
}

export async function waitForSyncIdle(): Promise<void> {
  const m = await import('@/lib/sync');
  await m.waitForSyncIdle();
  const health = await import('@/services/healthKitService');
  await health.waitForHealthSyncIdle();
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
export async function restoreTracked(
  userId: string,
  onProgress?: (p: RestoreProgress) => void
): Promise<RestoreResult> {
  await setRestorePending(true).catch(() => {});
  const result = await restoreFromAccount(userId, onProgress);
  if (result.ok) await setRestorePending(false).catch(() => {});
  else reportAuthIssue('restore', result.error);
  return result;
}

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

// Persist the deletion phase separately from sign-out so startup never restores a deleted account.
export const ACCOUNT_DELETION_KEY = 'accountDeletionPending';

export async function getSession(): Promise<Session | null> {
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
  if (await AsyncStorage.getItem(ACCOUNT_DELETION_KEY)) return null;
  return (await getSession())?.user.id ?? null;
}

export async function getAuthState(): Promise<AuthState> {
  return deriveAuthState(await getSession());
}


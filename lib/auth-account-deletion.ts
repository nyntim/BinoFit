import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { isSyncConfigured } from '@/lib/sync-status';
import { beginAuthTransition, isAuthTransitioning } from '@/lib/auth-transition';
import { waitForSyncIdle, getSession, ACCOUNT_DELETION_KEY } from '@/lib/auth-session';
import { initAuth, isAccountOperationInFlight } from '@/lib/auth-init';
import type { SignOutResult } from '@/lib/auth-sign-out';
import { completeAccountDeletion, resumeAccountDeletion } from '@/lib/auth-wipe';

export type PendingAccountDeletion = 'requested' | 'confirmed' | null;

export async function getPendingAccountDeletion(): Promise<PendingAccountDeletion> {
  const phase = await AsyncStorage.getItem(ACCOUNT_DELETION_KEY);
  return phase === 'requested' || phase === 'confirmed' ? phase : null;
}

/** Only call after explicit confirmation that cloud deletion remains unverified. */
export async function removePendingDeletionDeviceData(): Promise<SignOutResult> {
  if (isAuthTransitioning() || isAccountOperationInFlight()) {
    return { ok: false, message: 'Another account operation is in progress.' };
  }
  const release = beginAuthTransition();
  let completed = false;
  try {
    if (!(await getPendingAccountDeletion())) return { ok: false, message: 'There is no pending deletion.' };
    await waitForSyncIdle();
    await completeAccountDeletion();
    completed = true;
    return { ok: true };
  } catch {
    return { ok: false, message: 'Could not remove device data. Retry when this device is available.' };
  } finally {
    release();
    if (completed) await initAuth({ force: true });
  }
}

export async function canDeleteAccount(): Promise<boolean> {
  if (!isSyncConfigured()) return false;
  try {
    const { data, error } = await supabase.rpc('account_deletion_capability');
    return !error && data === 1;
  } catch { return false; }
}

/** Deletes owned cloud data and auth user atomically before touching local data. */
export async function deleteAccountAndWipe(): Promise<SignOutResult> {
  if (isAuthTransitioning() || isAccountOperationInFlight()) {
    return { ok: false, message: 'Another account operation is in progress.' };
  }
  const release = beginAuthTransition();
  let completed = false;
  try {
    await waitForSyncIdle();
    const pending = await AsyncStorage.getItem(ACCOUNT_DELETION_KEY);
    if (pending) {
      await resumeAccountDeletion();
    } else {
      const session = await getSession();
      if (!session || session.user.is_anonymous || !(await canDeleteAccount())) {
        return { ok: false, message: 'Account deletion is unavailable. Connect and try again.' };
      }
      await AsyncStorage.setItem(ACCOUNT_DELETION_KEY, 'requested');
      const { data, error } = await supabase.rpc('delete_own_account');
      if (error || data !== true) {
        return { ok: false, message: 'Could not confirm deletion. Your device data is kept. Retry when online.' };
      }
      await AsyncStorage.setItem(ACCOUNT_DELETION_KEY, 'confirmed');
      await completeAccountDeletion();
    }
    completed = true;
    return { ok: true };
  } catch {
    return { ok: false, message: 'Deletion is not confirmed. Device data is kept. Retry when online. If your session expired, verify cloud deletion separately or explicitly remove device data only.' };
  } finally {
    release();
    if (completed) await initAuth({ force: true });
  }
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { reloadPreferences } from '@/lib/app-preferences';
import { supabase } from '@/lib/supabase';
import { beginAuthTransition } from '@/lib/auth-transition';
import { clearUserData } from '@/lib/database';
import { clearPendingWipe, clearUserStorage, getPendingWipe } from '@/lib/storage';
import { restoreMealReminders } from '@/lib/reminders';
import { clearRestTimerAndNotifications } from '@/lib/workouts/rest-timer-store';
import { clearSpotifySession } from '@/lib/spotify/session-store';
import { waitForSyncIdle, getSession, ACCOUNT_DELETION_KEY } from '@/lib/auth-session';

/** Local half of sign-out: empties user data. Safe to run again. */
export async function finishWipe(): Promise<void> {
  await clearRestTimerAndNotifications(); // forget the rest timer and cancel its notification
  try {
    await clearSpotifySession(); // Keychain tokens must not outlive the account on this device
  } catch {
    // a Keychain error must not stop the wipe
  }
  await clearUserData();
  await clearUserStorage();
  await reloadPreferences(); // refresh the in-memory copy after sign-out cleared user keys
  await restoreMealReminders(); // reseeded meals have no reminders, so this cancels them all
  await clearPendingWipe();
}

/** Finishes a sign-out whose wipe did not complete, before anything can sync. */
export async function resumePendingWipe(): Promise<void> {
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

export async function completeAccountDeletion(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
  await finishWipe();
  await AsyncStorage.removeItem(ACCOUNT_DELETION_KEY);
}

export async function resumeAccountDeletion(): Promise<void> {
  const phase = await AsyncStorage.getItem(ACCOUNT_DELETION_KEY);
  if (!phase) return;
  const release = beginAuthTransition();
  try {
    await waitForSyncIdle();
    if (phase === 'requested') {
      // The transaction may have committed before its response was lost. A protected
      // receipt confirms that outcome; otherwise retry for the same authenticated owner.
      const receipt = await supabase.rpc('account_deletion_status');
      const { data, error } = !receipt.error && receipt.data === true
        ? { data: true, error: null }
        : await supabase.rpc('delete_own_account');
      if (error || data !== true) throw new Error('Account deletion needs an online retry.');
      await AsyncStorage.setItem(ACCOUNT_DELETION_KEY, 'confirmed');
    }
    await completeAccountDeletion();
  } finally { release(); }
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUnsyncedWeightEntries } from '@/lib/weight';
import { getUnsyncedWorkoutTree } from '@/lib/workouts/db';
import { getUnsyncedRoutines, getUnsyncedRoutineExercises } from '@/lib/workouts/routines';
import { supabase } from '@/lib/supabase';
import { beginAuthTransition, isAuthTransitioning } from '@/lib/auth-transition';
import {
  getUnsyncedFoodLogs,
  getUnsyncedMealDefinitions,
  getUnsyncedMealNames,
  getUnsyncedCustomFoods,
} from '@/lib/database';
import { clearPendingWipe, setPendingWipe, getUserGoals, getUserProfile } from '@/lib/storage';
import { syncNowAndWait, waitForSyncIdle, ACCOUNT_DELETION_KEY } from '@/lib/auth-session';
import { finishWipe } from '@/lib/auth-wipe';
import { initAuth, isAccountOperationInFlight } from '@/lib/auth-init';

/** Rows on the device that the account does not have yet. */
export async function countUnsynced(): Promise<number> {
  const [logs, defs, names, goals, profile, weight, tree, routines, routineExercises, foods] = await Promise.all([
    getUnsyncedFoodLogs(),
    getUnsyncedMealDefinitions(),
    getUnsyncedMealNames(),
    getUserGoals(),
    getUserProfile(),
    getUnsyncedWeightEntries(),
    getUnsyncedWorkoutTree(),
    getUnsyncedRoutines(),
    getUnsyncedRoutineExercises(),
    getUnsyncedCustomFoods(),
  ]);
  return foods.length + weight.length + Object.values(tree).reduce((n, rows) => n + rows.length, 0) + routines.length + routineExercises.length + logs.length + defs.length + names.length + (goals && !goals.synced_at ? 1 : 0) + (profile && !profile.synced_at ? 1 : 0);
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
  if (isAuthTransitioning() || isAccountOperationInFlight()) return { ok: false, message: 'Another account operation is in progress.' };
  const release = beginAuthTransition();
  let signedOut = false;
  let result: SignOutResult = { ok: true };
  try {
    await waitForSyncIdle();
    if (await AsyncStorage.getItem(ACCOUNT_DELETION_KEY)) return { ok: false, message: 'Finish account deletion before signing out.' };
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

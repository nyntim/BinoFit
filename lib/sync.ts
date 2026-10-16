import { supabase } from '@/lib/supabase';
import { getDeviceId } from '@/lib/device-id';
import {
  getUnsyncedFoodLogs,
  markFoodLogsSynced,
  getUnsyncedMealDefinitions,
  markMealDefinitionsSynced,
  getUnsyncedMealNames,
  markMealNamesSynced,
} from '@/lib/database';
import {
  getUserGoals,
  markGoalsSynced,
  getUserProfile,
  markProfileSynced,
  setLastSyncAt,
} from '@/lib/storage';
import { reportSyncStart, reportSyncResult } from '@/lib/sync-status';

let _syncing = false;
let _rerun = false;

/**
 * Push all unsynced local data to Supabase.
 * Never throws — callers can fire-and-forget. Outcomes are reported to `@/lib/sync-status`.
 * A call made while a sync is running schedules exactly one extra pass afterwards.
 * Never awaited inline; call without await after any write or on app foreground.
 */
export async function syncToSupabase(): Promise<void> {
  if (_syncing) {
    _rerun = true;
    return;
  }
  _syncing = true;
  try {
    do {
      _rerun = false;
      await runPass();
    } while (_rerun);
  } catch {
    // Never reject: reporting or persistence problems must not reach fire-and-forget callers.
  } finally {
    _syncing = false;
  }
}

async function runPass(): Promise<void> {
  reportSyncStart();
  const results = await Promise.allSettled([
    syncFoodLogs(),
    syncUserGoals(),
    syncUserProfile(),
    syncMealDefinitions(),
    syncMealNames(),
  ]);
  const ok = results.every((r) => r.status === 'fulfilled');
  reportSyncResult(ok);
  if (ok) {
    try {
      await setLastSyncAt(new Date().toISOString());
    } catch {
      // Persisting the timestamp is best-effort.
    }
  }
}

async function syncFoodLogs(): Promise<void> {
  const unsynced = await getUnsyncedFoodLogs();
  if (unsynced.length === 0) return;

  const deviceId = await getDeviceId();

  const rows = unsynced.map((log) => ({
    id: log.id,
    user_id: deviceId,
    date: log.date,
    meal_slot: log.meal_slot,
    food_id: log.food_id,
    serving_amount: log.serving_amount,
    serving_unit: log.serving_unit,
    created_at: log.created_at,
    updated_at: log.updated_at,
  }));

  const { error } = await supabase
    .from('food_logs')
    .upsert(rows, { onConflict: 'id' });

  if (error) throw error;
  await markFoodLogsSynced(unsynced.map((l) => l.id));
}

// Push-only. Deleted meals are not removed from Supabase (same gap as other tables).
async function syncMealDefinitions(): Promise<void> {
  const unsynced = await getUnsyncedMealDefinitions();
  if (unsynced.length === 0) return;

  const deviceId = await getDeviceId();

  const rows = unsynced.map((m) => ({
    id: m.id,
    user_id: deviceId,
    position: m.position,
    calorie_target: m.calorie_target,
    protein_target: m.protein_target,
    carb_target: m.carb_target,
    fat_target: m.fat_target,
    reminder_time: m.reminder_time ?? null,
    created_at: m.created_at,
    updated_at: m.updated_at,
  }));

  const { error } = await supabase
    .from('meal_definitions')
    .upsert(rows, { onConflict: 'user_id,id' });

  if (error) throw error;
  await markMealDefinitionsSynced(unsynced.map((m) => m.id));
}

async function syncMealNames(): Promise<void> {
  const unsynced = await getUnsyncedMealNames();
  if (unsynced.length === 0) return;

  const deviceId = await getDeviceId();

  const rows = unsynced.map((n) => ({
    user_id: deviceId,
    meal_id: n.meal_id,
    name: n.name,
    effective_from: n.effective_from,
    updated_at: n.updated_at,
  }));

  const { error } = await supabase
    .from('meal_names')
    .upsert(rows, { onConflict: 'user_id,meal_id,effective_from' });

  if (error) throw error;
  await markMealNamesSynced(unsynced);
}

async function syncUserGoals(): Promise<void> {
  const goals = await getUserGoals();
  if (!goals || goals.synced_at) return;

  const deviceId = await getDeviceId();

  const { error } = await supabase.from('user_goals').upsert(
    {
      user_id: deviceId,
      calorie_goal: goals.calorie_goal,
      protein_goal: goals.protein_goal,
      carb_goal: goals.carb_goal,
      fat_goal: goals.fat_goal,
      updated_at: goals.updated_at,
    },
    { onConflict: 'user_id' }
  );

  if (error) throw error;
  await markGoalsSynced(new Date().toISOString());
}

async function syncUserProfile(): Promise<void> {
  const profile = await getUserProfile();
  if (!profile || profile.synced_at) return;

  const deviceId = await getDeviceId();

  const { error } = await supabase.from('user_profile').upsert(
    {
      user_id: deviceId,
      weight: profile.weight,
      height: profile.height,
      activity_level: profile.activity_level,
      updated_at: profile.updated_at,
    },
    { onConflict: 'user_id' }
  );

  if (error) throw error;
  await markProfileSynced(new Date().toISOString());
}

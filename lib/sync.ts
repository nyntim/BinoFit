import { supabase } from '@/lib/supabase';
import { getDeviceId } from '@/lib/device-id';
import { getUnsyncedFoodLogs, markFoodLogsSynced } from '@/lib/database';
import { getUserGoals, markGoalsSynced, getUserProfile, markProfileSynced } from '@/lib/storage';

let _syncing = false;

/**
 * Push all unsynced local data to Supabase.
 * Never throws — all errors are swallowed so callers can fire-and-forget.
 * Never awaited inline; call without await after any write or on app foreground.
 */
export async function syncToSupabase(): Promise<void> {
  if (_syncing) return;
  _syncing = true;
  try {
    await Promise.all([syncFoodLogs(), syncUserGoals(), syncUserProfile()]);
  } catch {
    // Intentionally swallowed — sync failures are non-fatal
  } finally {
    _syncing = false;
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

  if (!error) {
    await markFoodLogsSynced(unsynced.map((l) => l.id));
  }
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

  if (!error) {
    await markGoalsSynced(new Date().toISOString());
  }
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

  if (!error) {
    await markProfileSynced(new Date().toISOString());
  }
}

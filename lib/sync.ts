import { supabase } from '@/lib/supabase';
import { getSessionUserId, initAuth, reconcileSyncedUid, retryPendingMergeTicket } from '@/lib/auth';
import { isAuthTransitioning } from '@/lib/auth-transition';
import {
  getUnsyncedFoodLogs,
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
import { markRowsSynced, purgeSyncedTombstones } from '@/lib/tombstones';
import { getUnsyncedWeightEntries } from '@/lib/weight';
import { getUnsyncedWorkoutTree, purgeSyncedExerciseTombstones } from '@/lib/workouts/db';
import { getUnsyncedRoutineExercises, getUnsyncedRoutines } from '@/lib/workouts/routines';
import { reportSyncStart, reportSyncResult } from '@/lib/sync-status';

let _current: Promise<void> | null = null;
let _rerun = false;

/**
 * Push all unsynced local data to Supabase.
 * Never throws — callers can fire-and-forget. Outcomes are reported to `@/lib/sync-status`.
 * A call made while a sync is running schedules exactly one extra pass afterwards and
 * resolves when the running sync (including that extra pass) has finished, so
 * `await syncToSupabase()` really waits. Never awaited inline after writes; call without await
 * after any write or on app foreground.
 */
export function syncToSupabase(): Promise<void> {
  if (_current) {
    _rerun = true;
    return _current;
  }
  const run = (async () => {
    try {
      do {
        _rerun = false;
        await runPass();
      } while (_rerun);
    } catch {
      // Never reject: reporting or persistence problems must not reach fire-and-forget callers.
    } finally {
      _current = null;
    }
  })();
  _current = run;
  return run;
}

/** Resolves when no sync is running. */
export function waitForSyncIdle(): Promise<void> {
  return _current ?? Promise.resolve();
}

async function runPass(): Promise<void> {
  // Sign-in merge or sign-out wipe in progress: whoever holds the flag triggers a sync after.
  if (isAuthTransitioning()) return;
  // No session yet (offline first launch, or sync not configured): skip without reporting a
  // failure. initAuth retries sign-in and triggers a fresh sync once a session exists.
  const userId = await getSessionUserId();
  if (!userId) {
    initAuth();
    return;
  }
  await retryPendingMergeTicket();
  await reconcileSyncedUid(userId);

  reportSyncStart();
  const results = await Promise.allSettled([
    syncFoodLogs(userId),
    syncUserGoals(userId),
    syncUserProfile(userId),
    syncMealDefinitions(userId),
    syncMealNames(userId),
    syncWeightEntries(userId),
    syncWorkoutTree(userId),
    syncRoutines(userId),
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

async function syncFoodLogs(userId: string): Promise<void> {
  const unsynced = await getUnsyncedFoodLogs();
  if (unsynced.length === 0) return;

  const rows = unsynced.map((log) => ({
    id: log.id,
    user_id: userId,
    date: log.date,
    meal_slot: log.meal_slot,
    food_id: log.food_id,
    serving_amount: log.serving_amount,
    serving_unit: log.serving_unit,
    created_at: log.created_at,
    updated_at: log.updated_at,
    deleted_at: log.deleted_at ?? null,
  }));

  const { error } = await supabase
    .from('food_logs')
    .upsert(rows, { onConflict: 'id' });

  if (error) throw error;
  await markRowsSynced(
    'food_logs',
    unsynced.map((l) => ({ id: l.id, updated_at: l.updated_at }))
  );
  await purgeSyncedTombstones('food_logs');
}

const WORKOUT_PUSH_CHUNK = 500;

async function upsertChunked(table: string, rows: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < rows.length; i += WORKOUT_PUSH_CHUNK) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(i, i + WORKOUT_PUSH_CHUNK), { onConflict: 'id' });
    if (error) throw error;
  }
}

/**
 * Pushes custom exercises, done workouts and their children. All four unsynced sets are read first
 * so nothing is marked synced that was not part of the snapshot; each table is marked synced
 * (only rows unchanged since the snapshot) and its pushed tombstones purged before the next.
 * Throws on the first error.
 */
async function syncWorkoutTree(userId: string): Promise<void> {
  const tree = await getUnsyncedWorkoutTree();

  if (tree.exercises.length > 0) {
    await upsertChunked(
      'exercises',
      tree.exercises.map((e) => ({
        id: e.id,
        user_id: userId,
        name: e.name,
        log_type: e.log_type,
        primary_muscles: e.primary_muscles,
        secondary_muscles: e.secondary_muscles,
        equipment: e.equipment,
        brand: e.brand,
        load_type: e.load_type,
        base_weight_kg: e.base_weight_kg,
        per_side: e.per_side,
        setup_notes: e.setup_notes,
        default_rest_seconds: e.default_rest_seconds,
        met: e.met,
        source: 'custom',
        hidden: e.hidden,
        created_at: e.created_at,
        updated_at: e.updated_at,
        deleted_at: e.deleted_at ?? null,
      }))
    );
    await markRowsSynced('exercises', tree.exercises);
  }
  await purgeSyncedExerciseTombstones();

  if (tree.workouts.length > 0) {
    await upsertChunked(
      'workouts',
      tree.workouts.map((w) => ({
        id: w.id,
        user_id: userId,
        status: w.status,
        source: w.source,
        name: w.name,
        date: w.date,
        started_at: w.started_at,
        ended_at: w.ended_at,
        duration_seconds: w.duration_seconds,
        notes: w.notes,
        routine_id: w.routine_id,
        created_at: w.created_at,
        updated_at: w.updated_at,
        deleted_at: w.deleted_at ?? null,
      }))
    );
    await markRowsSynced('workouts', tree.workouts);
    await purgeSyncedTombstones('workouts');
  }

  if (tree.workoutExercises.length > 0) {
    await upsertChunked(
      'workout_exercises',
      tree.workoutExercises.map((c) => ({
        id: c.id,
        user_id: userId,
        workout_id: c.workout_id,
        exercise_id: c.exercise_id,
        position: c.position,
        rest_seconds: c.rest_seconds,
        notes: c.notes,
        created_at: c.created_at,
        updated_at: c.updated_at,
        deleted_at: c.deleted_at ?? null,
      }))
    );
    await markRowsSynced('workout_exercises', tree.workoutExercises);
    await purgeSyncedTombstones('workout_exercises');
  }

  if (tree.sets.length > 0) {
    await upsertChunked(
      'workout_sets',
      tree.sets.map((s) => ({
        id: s.id,
        user_id: userId,
        workout_id: s.workout_id,
        workout_exercise_id: s.workout_exercise_id,
        position: s.position,
        set_type: s.set_type,
        weight_kg: s.weight_kg,
        reps: s.reps,
        duration_seconds: s.duration_seconds,
        distance_m: s.distance_m,
        rpe: s.rpe,
        completed_at: s.completed_at,
        created_at: s.created_at,
        updated_at: s.updated_at,
        deleted_at: s.deleted_at ?? null,
      }))
    );
    await markRowsSynced('workout_sets', tree.sets);
    await purgeSyncedTombstones('workout_sets');
  }
}

// Push-only. Deleted meals are not removed from Supabase (same gap as other tables).
async function syncMealDefinitions(userId: string): Promise<void> {
  const unsynced = await getUnsyncedMealDefinitions();
  if (unsynced.length === 0) return;

  const rows = unsynced.map((m) => ({
    id: m.id,
    user_id: userId,
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

async function syncMealNames(userId: string): Promise<void> {
  const unsynced = await getUnsyncedMealNames();
  if (unsynced.length === 0) return;

  const rows = unsynced.map((n) => ({
    user_id: userId,
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

async function syncUserGoals(userId: string): Promise<void> {
  const goals = await getUserGoals();
  if (!goals || goals.synced_at) return;

  const { error } = await supabase.from('user_goals').upsert(
    {
      user_id: userId,
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

async function syncUserProfile(userId: string): Promise<void> {
  const profile = await getUserProfile();
  if (!profile || profile.synced_at) return;

  const { error } = await supabase.from('user_profile').upsert(
    {
      user_id: userId,
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

async function syncWeightEntries(userId: string): Promise<void> {
  const unsynced = await getUnsyncedWeightEntries();
  if (unsynced.length === 0) return;

  const rows = unsynced.map((e) => ({
    id: e.id,
    user_id: userId,
    date: e.date,
    weight_kg: e.weight_kg,
    measured_at: e.measured_at,
    source: e.source ?? 'manual',
    created_at: e.created_at,
    updated_at: e.updated_at,
    deleted_at: e.deleted_at ?? null,
  }));

  const { error } = await supabase.from('weight_entries').upsert(rows, { onConflict: 'id' });

  if (error) throw error;
  await markRowsSynced(
    'weight_entries',
    unsynced.map((e) => ({ id: e.id, updated_at: e.updated_at }))
  );
  await purgeSyncedTombstones('weight_entries');
}

async function syncRoutines(userId: string): Promise<void> {
  const routines = await getUnsyncedRoutines();
  const routineExercises = await getUnsyncedRoutineExercises();

  if (routines.length > 0) {
    await upsertChunked(
      'routines',
      routines.map((r) => ({
        id: r.id,
        user_id: userId,
        name: r.name,
        position: r.position,
        created_at: r.created_at,
        updated_at: r.updated_at,
        deleted_at: r.deleted_at ?? null,
      }))
    );
    await markRowsSynced('routines', routines);
    await purgeSyncedTombstones('routines');
  }

  if (routineExercises.length > 0) {
    await upsertChunked(
      'routine_exercises',
      routineExercises.map((c) => ({
        id: c.id,
        user_id: userId,
        routine_id: c.routine_id,
        exercise_id: c.exercise_id,
        position: c.position,
        set_count: c.set_count,
        rest_seconds: c.rest_seconds,
        created_at: c.created_at,
        updated_at: c.updated_at,
        deleted_at: c.deleted_at ?? null,
      }))
    );
    await markRowsSynced('routine_exercises', routineExercises);
    await purgeSyncedTombstones('routine_exercises');
  }
}


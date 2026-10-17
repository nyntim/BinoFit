import { getDatabase } from '@/lib/database';
import { decideRemoteApply } from '@/lib/tombstones';
import type {
  RemoteExercise,
  RemoteWorkout,
  RemoteWorkoutExercise,
  RemoteWorkoutSet,
} from '@/lib/types';

function toIso(value: string | null | undefined, fallback: string): string {
  return value && Number.isFinite(Date.parse(value)) ? value : fallback;
}

function flag(v: number | boolean | null | undefined): number {
  return v === true || v === 1 ? 1 : 0;
}

/**
 * Applies the account's custom exercises. Source is forced to 'custom' and seed rows are never
 * overwritten. A newer remote tombstone keeps the local row as a tombstone (so past workouts keep
 * the name). Applied rows are marked synced. Returns how many exercises were inserted or updated.
 */
export async function applyRemoteExercises(
  rows: RemoteExercise[],
  referencedIds: Iterable<string> = []
): Promise<number> {
  if (rows.length === 0) return 0;
  const referenced = new Set(referencedIds);
  const db = await getDatabase();
  const now = new Date().toISOString();
  let applied = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const r of rows) {
      const updatedAt = toIso(r.updated_at, now);
      const existing = await txn.getFirstAsync<{ updated_at: string; source: string }>(
        'SELECT updated_at, source FROM exercises WHERE id = ?',
        [r.id]
      );
      if (existing?.source === 'seed') continue;
      const decision = decideRemoteApply({ updated_at: updatedAt, deleted_at: r.deleted_at }, existing);
      if (decision === 'skip' && !existing && r.deleted_at != null && referenced.has(r.id)) {
        // Deleted exercise that restored history still uses: keep it as a synced tombstone so
        // the workouts keep its name.
        await txn.runAsync(
          `INSERT INTO exercises
             (id, name, log_type, primary_muscles, secondary_muscles, equipment, brand, load_type,
              base_weight_kg, per_side, setup_notes, default_rest_seconds, met, source, hidden,
              created_at, updated_at, synced_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'custom', ?, ?, ?, ?, ?)`,
          [
            r.id,
            r.name,
            r.log_type,
            JSON.stringify(r.primary_muscles ?? []),
            JSON.stringify(r.secondary_muscles ?? []),
            r.equipment,
            r.brand,
            r.load_type,
            r.base_weight_kg,
            flag(r.per_side),
            r.setup_notes,
            r.default_rest_seconds,
            r.met,
            flag(r.hidden),
            toIso(r.created_at, updatedAt),
            updatedAt,
            now,
            r.deleted_at,
          ]
        );
        continue;
      }
      if (decision === 'skip') continue;
      if (decision === 'delete') {
        await txn.runAsync(
          'UPDATE exercises SET deleted_at = ?, updated_at = ?, synced_at = ? WHERE id = ?',
          [r.deleted_at ?? now, updatedAt, now, r.id]
        );
        continue;
      }
      await txn.runAsync(
        `INSERT INTO exercises
           (id, name, log_type, primary_muscles, secondary_muscles, equipment, brand, load_type,
            base_weight_kg, per_side, setup_notes, default_rest_seconds, met, source, hidden,
            created_at, updated_at, synced_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'custom', ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, log_type = excluded.log_type,
           primary_muscles = excluded.primary_muscles, secondary_muscles = excluded.secondary_muscles,
           equipment = excluded.equipment, brand = excluded.brand, load_type = excluded.load_type,
           base_weight_kg = excluded.base_weight_kg, per_side = excluded.per_side,
           setup_notes = excluded.setup_notes, default_rest_seconds = excluded.default_rest_seconds,
           met = excluded.met, source = 'custom', hidden = excluded.hidden,
           updated_at = excluded.updated_at, synced_at = excluded.synced_at, deleted_at = NULL`,
        [
          r.id,
          r.name,
          r.log_type,
          JSON.stringify(r.primary_muscles ?? []),
          JSON.stringify(r.secondary_muscles ?? []),
          r.equipment,
          r.brand,
          r.load_type,
          r.base_weight_kg,
          flag(r.per_side),
          r.setup_notes,
          r.default_rest_seconds,
          r.met,
          flag(r.hidden),
          toIso(r.created_at, updatedAt),
          updatedAt,
          now,
        ]
      );
      applied++;
    }
  });
  return applied;
}

export type RemoteWorkoutTree = {
  workouts: RemoteWorkout[];
  workoutExercises: RemoteWorkoutExercise[];
  sets: RemoteWorkoutSet[];
};

/**
 * Applies workouts, then their exercises, then sets in one transaction, last write wins on
 * updated_at. Restored workouts are always `done`. A newer remote tombstone deletes the local
 * row (a workout's local children go with it). Applied rows are marked synced. Returns the number
 * of workouts inserted or updated.
 */
export async function applyRemoteWorkoutTree(tree: RemoteWorkoutTree): Promise<number> {
  const { workouts, workoutExercises, sets } = tree;
  if (workouts.length === 0 && workoutExercises.length === 0 && sets.length === 0) return 0;
  const db = await getDatabase();
  const now = new Date().toISOString();
  let applied = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const r of workouts) {
      const updatedAt = toIso(r.updated_at, now);
      const existing = await txn.getFirstAsync<{ updated_at: string }>(
        'SELECT updated_at FROM workouts WHERE id = ?',
        [r.id]
      );
      const decision = decideRemoteApply({ updated_at: updatedAt, deleted_at: r.deleted_at }, existing);
      if (decision === 'skip') continue;
      if (decision === 'delete') {
        await txn.runAsync('DELETE FROM workout_sets WHERE workout_id = ?', [r.id]);
        await txn.runAsync('DELETE FROM workout_exercises WHERE workout_id = ?', [r.id]);
        await txn.runAsync('DELETE FROM workouts WHERE id = ?', [r.id]);
        continue;
      }
      await txn.runAsync(
        `INSERT INTO workouts
           (id, status, source, name, date, started_at, ended_at, duration_seconds, notes, routine_id,
            created_at, updated_at, synced_at, deleted_at)
         VALUES (?, 'done', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           status = 'done', source = excluded.source, name = excluded.name, date = excluded.date,
           started_at = excluded.started_at, ended_at = excluded.ended_at,
           duration_seconds = excluded.duration_seconds, notes = excluded.notes,
           routine_id = excluded.routine_id, updated_at = excluded.updated_at,
           synced_at = excluded.synced_at, deleted_at = NULL`,
        [
          r.id,
          r.source ?? 'live',
          r.name,
          r.date,
          r.started_at,
          r.ended_at,
          r.duration_seconds,
          r.notes,
          r.routine_id,
          toIso(r.created_at, updatedAt),
          updatedAt,
          now,
        ]
      );
      applied++;
    }

    for (const r of workoutExercises) {
      const parentLive = await txn.getFirstAsync<{ id: string }>(
        'SELECT id FROM workouts WHERE id = ? AND deleted_at IS NULL',
        [r.workout_id]
      );
      if (!parentLive) continue;
      const updatedAt = toIso(r.updated_at, now);
      const existing = await txn.getFirstAsync<{ updated_at: string }>(
        'SELECT updated_at FROM workout_exercises WHERE id = ?',
        [r.id]
      );
      const decision = decideRemoteApply({ updated_at: updatedAt, deleted_at: r.deleted_at }, existing);
      if (decision === 'skip') continue;
      if (decision === 'delete') {
        await txn.runAsync('DELETE FROM workout_sets WHERE workout_exercise_id = ?', [r.id]);
        await txn.runAsync('DELETE FROM workout_exercises WHERE id = ?', [r.id]);
        continue;
      }
      await txn.runAsync(
        `INSERT INTO workout_exercises
           (id, workout_id, exercise_id, position, rest_seconds, notes, created_at, updated_at, synced_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           workout_id = excluded.workout_id, exercise_id = excluded.exercise_id,
           position = excluded.position, rest_seconds = excluded.rest_seconds, notes = excluded.notes,
           updated_at = excluded.updated_at, synced_at = excluded.synced_at, deleted_at = NULL`,
        [
          r.id,
          r.workout_id,
          r.exercise_id,
          r.position,
          r.rest_seconds,
          r.notes,
          toIso(r.created_at, updatedAt),
          updatedAt,
          now,
        ]
      );
    }

    for (const r of sets) {
      const parentLive = await txn.getFirstAsync<{ id: string }>(
        'SELECT id FROM workouts WHERE id = ? AND deleted_at IS NULL',
        [r.workout_id]
      );
      if (!parentLive) continue;
      const updatedAt = toIso(r.updated_at, now);
      const existing = await txn.getFirstAsync<{ updated_at: string }>(
        'SELECT updated_at FROM workout_sets WHERE id = ?',
        [r.id]
      );
      const decision = decideRemoteApply({ updated_at: updatedAt, deleted_at: r.deleted_at }, existing);
      if (decision === 'skip') continue;
      if (decision === 'delete') {
        await txn.runAsync('DELETE FROM workout_sets WHERE id = ?', [r.id]);
        continue;
      }
      await txn.runAsync(
        `INSERT INTO workout_sets
           (id, workout_id, workout_exercise_id, position, set_type, weight_kg, reps, duration_seconds,
            distance_m, rpe, completed_at, created_at, updated_at, synced_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           workout_id = excluded.workout_id, workout_exercise_id = excluded.workout_exercise_id,
           position = excluded.position, set_type = excluded.set_type, weight_kg = excluded.weight_kg,
           reps = excluded.reps, duration_seconds = excluded.duration_seconds,
           distance_m = excluded.distance_m, rpe = excluded.rpe, completed_at = excluded.completed_at,
           updated_at = excluded.updated_at, synced_at = excluded.synced_at, deleted_at = NULL`,
        [
          r.id,
          r.workout_id,
          r.workout_exercise_id,
          r.position,
          r.set_type ?? 'normal',
          r.weight_kg,
          r.reps,
          r.duration_seconds,
          r.distance_m,
          r.rpe,
          r.completed_at,
          toIso(r.created_at, updatedAt),
          updatedAt,
          now,
        ]
      );
    }
  });
  return applied;
}

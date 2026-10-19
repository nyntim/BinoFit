import { getDatabase } from '@/lib/database';
import type { WorkoutExercise, WorkoutSet } from '@/lib/types';
import {
  buildWorkoutExerciseRow,
  buildWorkoutSetRow,
  getWorkout,
  insertWorkoutExercise,
  insertWorkoutSet,
  nextExercisePosition,
  nextSetPosition,
} from '@/lib/workouts/db';
import { getPreferences } from '@/lib/app-preferences';
import { getExerciseById } from '@/lib/workouts/exercises';
import { prefillSets, resolveRestSeconds } from '@/lib/workouts/prefill';

export type PreviousOptions = {
  /** The workout being edited; never its own previous. */
  excludeWorkoutId?: string;
  /** Only done workouts that started before this ISO time count. Default: now. */
  before?: string;
};

/**
 * For each exercise, the sets of the latest earlier done workout that has it (live sets only,
 * in order). Exercises with no earlier performance are absent from the map.
 */
export async function getPreviousPerformance(
  exerciseIds: string[],
  opts: PreviousOptions = {}
): Promise<Map<string, WorkoutSet[]>> {
  const result = new Map<string, WorkoutSet[]>();
  const ids = Array.from(new Set(exerciseIds));
  if (ids.length === 0) return result;
  const db = await getDatabase();
  const before = opts.before ?? new Date().toISOString();
  const exclude = opts.excludeWorkoutId ?? '';
  for (const exerciseId of ids) {
    const link = await db.getFirstAsync<{ id: string }>(
      `SELECT we.id FROM workout_exercises we
         JOIN workouts w ON w.id = we.workout_id
        WHERE we.exercise_id = ? AND we.deleted_at IS NULL
          AND w.deleted_at IS NULL AND w.status = 'done' AND w.id <> ?
          AND COALESCE(w.started_at, w.created_at) < ?
          AND EXISTS (SELECT 1 FROM workout_sets s WHERE s.workout_exercise_id = we.id AND s.deleted_at IS NULL)
        ORDER BY COALESCE(w.started_at, w.created_at) DESC, we.created_at DESC
        LIMIT 1`,
      [exerciseId, exclude, before]
    );
    if (!link) continue;
    const sets = await db.getAllAsync<WorkoutSet>(
      'SELECT * FROM workout_sets WHERE workout_exercise_id = ? AND deleted_at IS NULL ORDER BY position, created_at',
      [link.id]
    );
    if (sets.length > 0) result.set(exerciseId, sets);
  }
  return result;
}

/** The most recent non-null rest used for an exercise in any other workout, or null. */
export async function getLastRestSeconds(exerciseId: string, excludeWorkoutId?: string): Promise<number | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ rest_seconds: number }>(
    `SELECT we.rest_seconds FROM workout_exercises we
       JOIN workouts w ON w.id = we.workout_id
      WHERE we.exercise_id = ? AND we.deleted_at IS NULL AND w.deleted_at IS NULL
        AND we.rest_seconds IS NOT NULL AND we.workout_id <> ?
      ORDER BY we.updated_at DESC
      LIMIT 1`,
    [exerciseId, excludeWorkoutId ?? '']
  );
  return row?.rest_seconds ?? null;
}

/**
 * Adds an exercise to a workout in one transaction: the link with its resolved rest (last rest used,
 * else the exercise default, else 90 s) and sets prefilled from the previous performance, or the
 * user's default set count as a minimum, adding empty sets after any previous sets.
 */
export async function addExerciseToWorkout(workoutId: string, exerciseId: string): Promise<WorkoutExercise> {
  const db = await getDatabase();
  const workout = await getWorkout(workoutId);
  if (!workout) throw new Error('Workout not found');
  const exercise = await getExerciseById(exerciseId);
  const last = await getLastRestSeconds(exerciseId, workoutId);
  const before = workout.started_at ?? workout.created_at;
  const previous = await getPreviousPerformance([exerciseId], { excludeWorkoutId: workoutId, before });
  const defaultSetCount = getPreferences().defaultSetCount;
  const values = prefillSets(previous.get(exerciseId) ?? [], defaultSetCount);
  while (values.length < defaultSetCount) values.push({});
  const rest = resolveRestSeconds(last, exercise?.default_rest_seconds);

  let link: WorkoutExercise | null = null;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const row = buildWorkoutExerciseRow(
      { workout_id: workoutId, exercise_id: exerciseId, rest_seconds: rest },
      await nextExercisePosition(txn, workoutId)
    );
    await insertWorkoutExercise(txn, row);
    let position = await nextSetPosition(txn, row.id);
    for (const v of values) {
      await insertWorkoutSet(txn, buildWorkoutSetRow({ ...v, workout_exercise_id: row.id }, workoutId, position));
      position += 1;
    }
    link = row;
  });
  if (!link) throw new Error('Could not add the exercise');
  return link;
}

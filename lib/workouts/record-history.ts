// Batched read of prior eligible weight_reps sets from earlier done workouts.
import { getDatabase } from '@/lib/database';
import type { ExerciseLogType, SetType, WorkoutWithExercises } from '@/lib/types';
import { countRecordExercises, recordsByExercise, type RecordSet } from '@/lib/workouts/records';

const CHUNK = 400;

export type PriorRecordSetsOptions = {
  excludeWorkoutId: string;
  before: string;
};

type PriorSetRow = {
  set_id: string;
  workout_id: string;
  exercise_id: string;
  at: string;
  position: number;
  weight_kg: number;
  reps: number;
  set_type: SetType;
  completed_at: string;
  log_type: ExerciseLogType;
  per_side: number;
};

/**
 * Loads eligible weight_reps sets for `exerciseIds` from done workouts other than `excludeWorkoutId`
 * whose `COALESCE(started_at, created_at)` is strictly before `before`.
 * Does not filter `exercises.deleted_at` or `exercises.hidden` so tombstoned custom exercises keep their history.
 */
export async function getPriorRecordSets(
  exerciseIds: string[],
  opts: PriorRecordSetsOptions
): Promise<RecordSet[]> {
  const ids = Array.from(new Set(exerciseIds));
  if (ids.length === 0) return [];
  const db = await getDatabase();
  const rows: PriorSetRow[] = [];

  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const placeholders = part.map(() => '?').join(',');
    const batch = await db.getAllAsync<PriorSetRow>(
      `SELECT
         s.id AS set_id,
         s.workout_id AS workout_id,
         we.exercise_id AS exercise_id,
         COALESCE(w.started_at, w.created_at) AS at,
         s.position AS position,
         s.weight_kg AS weight_kg,
         s.reps AS reps,
         s.set_type AS set_type,
         s.completed_at AS completed_at,
         e.log_type AS log_type,
         e.per_side AS per_side
       FROM workout_sets s
       JOIN workout_exercises we ON we.id = s.workout_exercise_id
       JOIN workouts w ON w.id = s.workout_id
       JOIN exercises e ON e.id = we.exercise_id
       WHERE we.exercise_id IN (${placeholders})
         AND w.status = 'done'
         AND w.id <> ?
         AND COALESCE(w.started_at, w.created_at) < ?
         AND e.log_type = 'weight_reps'
         AND s.set_type <> 'warmup'
         AND s.completed_at IS NOT NULL
         AND s.weight_kg > 0
         AND s.reps > 0
         AND w.deleted_at IS NULL
         AND we.deleted_at IS NULL
         AND s.deleted_at IS NULL
       ORDER BY COALESCE(w.started_at, w.created_at) ASC, s.position ASC, s.id ASC`,
      [...part, opts.excludeWorkoutId, opts.before]
    );
    rows.push(...batch);
  }

  return rows.map((r) => ({
    setId: r.set_id,
    workoutId: r.workout_id,
    exerciseId: r.exercise_id,
    at: r.at,
    position: r.position,
    weightKg: r.weight_kg,
    reps: r.reps,
    setType: r.set_type,
    completedAt: r.completed_at,
    logType: r.log_type,
    perSide: Boolean(r.per_side),
  }));
}

/**
 * Records each given done workout set, as the number of exercises that beat the history before it.
 * One batched query anchored on the newest workout; each workout then keeps only sets that started
 * strictly before it. Workouts with no record are left out of the map.
 */
export async function getWorkoutRecordCounts(workouts: WorkoutWithExercises[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (workouts.length === 0) return counts;
  const atOf = (w: WorkoutWithExercises) => w.started_at ?? w.created_at;
  const newest = workouts.reduce((a, b) => (atOf(b) > atOf(a) ? b : a));
  const ids = new Set<string>();
  for (const w of workouts) {
    for (const ex of w.exercises ?? []) {
      if (ex.exercise?.log_type === 'weight_reps') ids.add(ex.exercise_id);
    }
  }
  if (ids.size === 0) return counts;
  const prior = await getPriorRecordSets([...ids], { excludeWorkoutId: newest.id, before: atOf(newest) });
  for (const w of workouts) {
    const at = atOf(w);
    const before = prior.filter((s) => s.at < at && s.workoutId !== w.id);
    const n = countRecordExercises(w, recordsByExercise(before));
    if (n > 0) counts.set(w.id, n);
  }
  return counts;
}

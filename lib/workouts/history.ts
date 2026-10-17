// Reads of finished workouts for the Training tab and history list, hydrated with exercises and
// sets in a fixed number of queries.
import { getDatabase } from '@/lib/database';
import { mapExerciseRow, UNKNOWN_EXERCISE_NAME, type ExerciseRow } from '@/lib/workouts/db';
import type {
  Exercise,
  Workout,
  WorkoutExercise,
  WorkoutExerciseWithSets,
  WorkoutSet,
  WorkoutWithExercises,
} from '@/lib/types';

const CHUNK = 400;
const ORDER = 'ORDER BY date DESC, COALESCE(started_at, created_at) DESC, created_at DESC, id DESC';

async function selectIn<T>(
  sql: (placeholders: string) => string,
  ids: string[]
): Promise<T[]> {
  const db = await getDatabase();
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    out.push(...(await db.getAllAsync<T>(sql(part.map(() => '?').join(',')), part)));
  }
  return out;
}

async function hydrate(workouts: Workout[]): Promise<WorkoutWithExercises[]> {
  if (workouts.length === 0) return [];
  const ids = workouts.map((w) => w.id);
  const links = await selectIn<WorkoutExercise>(
    (p) =>
      `SELECT * FROM workout_exercises WHERE workout_id IN (${p}) AND deleted_at IS NULL ORDER BY position, created_at`,
    ids
  );
  const sets = await selectIn<WorkoutSet>(
    (p) =>
      `SELECT * FROM workout_sets WHERE workout_id IN (${p}) AND deleted_at IS NULL ORDER BY position, created_at`,
    ids
  );
  const exerciseIds = Array.from(new Set(links.map((l) => l.exercise_id)));
  const exercises = new Map<string, Exercise>();
  for (const r of await selectIn<ExerciseRow>((p) => `SELECT * FROM exercises WHERE id IN (${p})`, exerciseIds)) {
    exercises.set(r.id, mapExerciseRow(r));
  }
  const setsByLink = new Map<string, WorkoutSet[]>();
  for (const s of sets) {
    const list = setsByLink.get(s.workout_exercise_id);
    if (list) list.push(s);
    else setsByLink.set(s.workout_exercise_id, [s]);
  }
  const linksByWorkout = new Map<string, WorkoutExerciseWithSets[]>();
  for (const l of links) {
    const exercise = exercises.get(l.exercise_id) ?? null;
    const row: WorkoutExerciseWithSets = {
      ...l,
      exercise,
      exercise_name: exercise?.name ?? UNKNOWN_EXERCISE_NAME,
      sets: setsByLink.get(l.id) ?? [],
    };
    const list = linksByWorkout.get(l.workout_id);
    if (list) list.push(row);
    else linksByWorkout.set(l.workout_id, [row]);
  }
  return workouts.map((w) => ({ ...w, exercises: linksByWorkout.get(w.id) ?? [] }));
}

/** Done workouts with `date` from startDate to endDate inclusive (yyyy-MM-dd), newest first. */
export async function getDoneWorkoutsBetween(startDate: string, endDate: string): Promise<WorkoutWithExercises[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Workout>(
    `SELECT * FROM workouts WHERE status = 'done' AND deleted_at IS NULL AND date >= ? AND date <= ? ${ORDER}`,
    [startDate, endDate]
  );
  return hydrate(rows);
}

/** Done workouts for Apple Health export (includes tombstones). */
export async function getDoneWorkoutsForHealth(): Promise<
  Pick<
    Workout,
    'id' | 'started_at' | 'ended_at' | 'duration_seconds' | 'updated_at' | 'deleted_at'
  >[]
> {
  const db = await getDatabase();
  return db.getAllAsync(
    `SELECT id, started_at, ended_at, duration_seconds, updated_at, deleted_at
     FROM workouts WHERE status = 'done'`
  );
}

/** Done workouts, newest first, one page at a time. */
export async function getRecentDoneWorkouts(limit: number, offset = 0): Promise<WorkoutWithExercises[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Workout>(
    `SELECT * FROM workouts WHERE status = 'done' AND deleted_at IS NULL ${ORDER} LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return hydrate(rows);
}

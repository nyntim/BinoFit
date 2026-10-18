import * as Crypto from 'expo-crypto';
import type * as SQLite from 'expo-sqlite';
import { format, subHours } from 'date-fns';
import { getPreferences } from '@/lib/app-preferences';
import { getDatabase } from '@/lib/database';
import { tombstoneSql } from '@/lib/tombstones';
import type {
  Exercise,
  Routine,
  RoutineExercise,
  RoutineExerciseWithExercise,
  RoutineWithExercises,
  Workout,
} from '@/lib/types';
import { setActiveWorkout } from '@/lib/workouts/active-workout-store';
import {
  ActiveWorkoutExistsError,
  UNKNOWN_EXERCISE_NAME,
  buildWorkoutExerciseRow,
  buildWorkoutSetRow,
  getActiveWorkout,
  getWorkoutWithExercises,
  insertWorkout,
  insertWorkoutExercise,
  insertWorkoutSet,
  mapExerciseRow,
  type ExerciseRow,
} from '@/lib/workouts/db';
import { getExerciseById } from '@/lib/workouts/exercises';
import { resolveRestSeconds } from '@/lib/workouts/prefill';
import { getLastRestSeconds, getPreviousPerformance } from '@/lib/workouts/previous';
import {
  clampSetCount,
  planRoutineStart,
  routineDisplayName,
  routineFromWorkout,
} from '@/lib/workouts/routine-plan';

const DEFAULT_DRAFT_START_HOURS_AGO = 1;
const DEFAULT_DRAFT_DURATION_SECONDS = 3600;

async function loadExerciseMap(
  db: SQLite.SQLiteDatabase,
  exerciseIds: string[]
): Promise<Map<string, Exercise>> {
  const unique = Array.from(new Set(exerciseIds));
  const map = new Map<string, Exercise>();
  if (unique.length === 0) return map;
  // No deleted_at filter: a tombstoned custom exercise keeps its name on routines that use it.
  const rows = await db.getAllAsync<ExerciseRow>(
    `SELECT * FROM exercises WHERE id IN (${unique.map(() => '?').join(',')})`,
    unique
  );
  for (const r of rows) map.set(r.id, mapExerciseRow(r));
  return map;
}

/** A live routine by id, or null when missing or tombstoned. */
export async function getRoutine(id: string): Promise<Routine | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Routine>('SELECT * FROM routines WHERE id = ? AND deleted_at IS NULL', [
    id,
  ]);
}

/**
 * A live routine with its live exercises in order. Exercise definitions are joined without a
 * `deleted_at` filter so a tombstoned custom exercise keeps its name; a missing definition falls
 * back to "Unknown exercise".
 */
export async function getRoutineWithExercises(id: string): Promise<RoutineWithExercises | null> {
  const db = await getDatabase();
  const routine = await db.getFirstAsync<Routine>(
    'SELECT * FROM routines WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  if (!routine) return null;
  const links = await db.getAllAsync<RoutineExercise>(
    'SELECT * FROM routine_exercises WHERE routine_id = ? AND deleted_at IS NULL ORDER BY position, created_at',
    [id]
  );
  const exercises = await loadExerciseMap(
    db,
    links.map((l) => l.exercise_id)
  );
  const withDefs: RoutineExerciseWithExercise[] = links.map((l) => {
    const exercise = exercises.get(l.exercise_id) ?? null;
    return {
      ...l,
      exercise,
      exercise_name: exercise?.name ?? UNKNOWN_EXERCISE_NAME,
    };
  });
  return { ...routine, exercises: withDefs };
}

/** All live routines in position order, each with its live exercises in position order. */
export async function getRoutines(): Promise<RoutineWithExercises[]> {
  const db = await getDatabase();
  const routines = await db.getAllAsync<Routine>(
    'SELECT * FROM routines WHERE deleted_at IS NULL ORDER BY position, created_at'
  );
  if (routines.length === 0) return [];
  const routineIds = routines.map((r) => r.id);
  const links = await db.getAllAsync<RoutineExercise>(
    `SELECT * FROM routine_exercises
      WHERE routine_id IN (${routineIds.map(() => '?').join(',')})
        AND deleted_at IS NULL
      ORDER BY position, created_at`,
    routineIds
  );
  const exercises = await loadExerciseMap(
    db,
    links.map((l) => l.exercise_id)
  );
  const byRoutine = new Map<string, RoutineExerciseWithExercise[]>();
  for (const l of links) {
    const exercise = exercises.get(l.exercise_id) ?? null;
    const item: RoutineExerciseWithExercise = {
      ...l,
      exercise,
      exercise_name: exercise?.name ?? UNKNOWN_EXERCISE_NAME,
    };
    const list = byRoutine.get(l.routine_id);
    if (list) list.push(item);
    else byRoutine.set(l.routine_id, [item]);
  }
  return routines.map((r) => ({ ...r, exercises: byRoutine.get(r.id) ?? [] }));
}

async function nextRoutinePosition(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM routines WHERE deleted_at IS NULL'
  );
  return row?.next ?? 0;
}

async function nextRoutineExercisePosition(
  db: SQLite.SQLiteDatabase,
  routineId: string
): Promise<number> {
  const row = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM routine_exercises WHERE routine_id = ? AND deleted_at IS NULL',
    [routineId]
  );
  return row?.next ?? 0;
}

/** Inserts a new routine at `max(position) + 1` (0 when none). Blank name becomes "Routine". */
export async function createRoutine(name?: string | null): Promise<Routine> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const position = await nextRoutinePosition(db);
  const routine: Routine = {
    id: Crypto.randomUUID(),
    name: routineDisplayName(name),
    position,
    created_at: now,
    updated_at: now,
    synced_at: null,
    deleted_at: null,
  };
  await db.runAsync(
    `INSERT INTO routines (id, name, position, created_at, updated_at, synced_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
    [routine.id, routine.name, routine.position, now, now]
  );
  return routine;
}

/** Trims and updates a routine's name ("Routine" when blank), bumps updated_at and clears synced_at. */
export async function renameRoutine(id: string, name: string): Promise<Routine | null> {
  const db = await getDatabase();
  const nextName = routineDisplayName(name);
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE routines SET name = ?, updated_at = ?, synced_at = NULL WHERE id = ? AND deleted_at IS NULL',
    [nextName, now, id]
  );
  return getRoutine(id);
}

/** Writes dense 0..n-1 positions for the given routine ids in one transaction. */
export async function reorderRoutines(orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await txn.runAsync(
        'UPDATE routines SET position = ?, updated_at = ?, synced_at = NULL WHERE id = ? AND deleted_at IS NULL',
        [i, now, orderedIds[i]]
      );
    }
  });
}

/**
 * Appends an exercise to a routine with `set_count` from the user's default set count (clamped to
 * 1..10) and `rest_seconds` resolved from the last rest used, else the exercise default, else 90 s.
 */
export async function addExerciseToRoutine(
  routineId: string,
  exerciseId: string
): Promise<RoutineExercise> {
  const db = await getDatabase();
  const routine = await getRoutine(routineId);
  if (!routine) throw new Error('Routine not found');
  const exercise = await getExerciseById(exerciseId);
  const lastRest = await getLastRestSeconds(exerciseId);
  const setCount = clampSetCount(getPreferences().defaultSetCount);
  const restSeconds = resolveRestSeconds(lastRest, exercise?.default_rest_seconds);
  const now = new Date().toISOString();
  let row: RoutineExercise | null = null;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const position = await nextRoutineExercisePosition(txn, routineId);
    const created: RoutineExercise = {
      id: Crypto.randomUUID(),
      routine_id: routineId,
      exercise_id: exerciseId,
      position,
      set_count: setCount,
      rest_seconds: restSeconds,
      created_at: now,
      updated_at: now,
      synced_at: null,
      deleted_at: null,
    };
    await txn.runAsync(
      `INSERT INTO routine_exercises
         (id, routine_id, exercise_id, position, set_count, rest_seconds, created_at, updated_at, synced_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      [
        created.id,
        created.routine_id,
        created.exercise_id,
        created.position,
        created.set_count,
        created.rest_seconds,
        now,
        now,
      ]
    );
    row = created;
  });
  if (!row) throw new Error('Could not add the exercise');
  return row;
}

export type RoutineExercisePatch = {
  set_count?: number;
  rest_seconds?: number | null;
};

/** Updates set_count (clamped to 1..10) and/or rest_seconds on a live routine exercise. */
export async function updateRoutineExercise(
  id: string,
  patch: RoutineExercisePatch
): Promise<void> {
  const db = await getDatabase();
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (patch.set_count !== undefined) {
    sets.push('set_count = ?');
    params.push(clampSetCount(patch.set_count));
  }
  if (patch.rest_seconds !== undefined) {
    sets.push('rest_seconds = ?');
    params.push(patch.rest_seconds);
  }
  if (sets.length === 0) return;
  sets.push('updated_at = ?', 'synced_at = NULL');
  params.push(new Date().toISOString(), id);
  await db.runAsync(
    `UPDATE routine_exercises SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    params
  );
}

/** Updates a routine exercise's planned set count (clamped to 1..10). */
export async function updateRoutineExerciseSetCount(id: string, setCount: number): Promise<void> {
  await updateRoutineExercise(id, { set_count: setCount });
}

/** Updates a routine exercise's rest_seconds (0 is off). */
export async function updateRoutineExerciseRest(
  id: string,
  restSeconds: number | null
): Promise<void> {
  await updateRoutineExercise(id, { rest_seconds: restSeconds });
}

/** Writes dense 0..n-1 positions for a routine's exercises in one transaction. */
export async function reorderRoutineExercises(
  routineIdOrIds: string | string[],
  maybeOrderedIds?: string[]
): Promise<void> {
  const routineId = typeof routineIdOrIds === 'string' ? routineIdOrIds : null;
  const orderedIds = Array.isArray(routineIdOrIds) ? routineIdOrIds : (maybeOrderedIds ?? []);
  if (orderedIds.length === 0) return;
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (let i = 0; i < orderedIds.length; i++) {
      if (routineId) {
        await txn.runAsync(
          'UPDATE routine_exercises SET position = ?, updated_at = ?, synced_at = NULL WHERE id = ? AND routine_id = ? AND deleted_at IS NULL',
          [i, now, orderedIds[i], routineId]
        );
      } else {
        await txn.runAsync(
          'UPDATE routine_exercises SET position = ?, updated_at = ?, synced_at = NULL WHERE id = ? AND deleted_at IS NULL',
          [i, now, orderedIds[i]]
        );
      }
    }
  });
}

/** Tombstones a single routine exercise, leaving the parent routine intact. */
export async function removeRoutineExercise(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(`${tombstoneSql('routine_exercises')} WHERE id = ? AND deleted_at IS NULL`, [
    now,
    now,
    id,
  ]);
}

/** Tombstones a routine and all of its live exercises in one transaction. */
export async function deleteRoutine(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `${tombstoneSql('routine_exercises')} WHERE routine_id = ? AND deleted_at IS NULL`,
      [now, now, id]
    );
    await txn.runAsync(`${tombstoneSql('routines')} WHERE id = ? AND deleted_at IS NULL`, [
      now,
      now,
      id,
    ]);
  });
}

/**
 * Saves a finished workout as a new routine at the end of the list. Exercises with no live sets
 * are skipped; if none remain, returns null and writes nothing. Never modifies the source workout.
 */
export async function saveWorkoutAsRoutine(workoutId: string): Promise<RoutineWithExercises | null> {
  const workout = await getWorkoutWithExercises(workoutId);
  if (!workout) return null;

  const lastRestByExercise = new Map<string, number | null>();
  for (const ex of workout.exercises) {
    if (ex.rest_seconds === null && !lastRestByExercise.has(ex.exercise_id)) {
      lastRestByExercise.set(ex.exercise_id, await getLastRestSeconds(ex.exercise_id, workoutId));
    }
  }

  const draft = routineFromWorkout(workout, lastRestByExercise);
  if (draft.exercises.length === 0) return null;

  const db = await getDatabase();
  const now = new Date().toISOString();
  const routineId = Crypto.randomUUID();

  await db.withExclusiveTransactionAsync(async (txn) => {
    const position = await nextRoutinePosition(txn);
    await txn.runAsync(
      `INSERT INTO routines (id, name, position, created_at, updated_at, synced_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
      [routineId, draft.name, position, now, now]
    );
    for (let i = 0; i < draft.exercises.length; i++) {
      const ex = draft.exercises[i];
      await txn.runAsync(
        `INSERT INTO routine_exercises
           (id, routine_id, exercise_id, position, set_count, rest_seconds, created_at, updated_at, synced_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
        [Crypto.randomUUID(), routineId, ex.exercise_id, i, ex.set_count, ex.rest_seconds, now, now]
      );
    }
  });

  return getRoutineWithExercises(routineId);
}

/**
 * Starts a live workout from a routine in one transaction and sets the active-workout store.
 * Returns `'empty'` when the routine is missing or has no live exercises, and `'active'` when a
 * live workout is already in progress (leaving the existing session untouched).
 */
export async function startLiveFromRoutine(
  id: string,
  now: Date = new Date()
): Promise<Workout | 'empty' | 'active'> {
  const routine = await getRoutineWithExercises(id);
  if (!routine || routine.exercises.length === 0) return 'empty';
  if (await getActiveWorkout()) return 'active';

  const before = new Date(Math.max(now.getTime(), Date.now()) + 1000).toISOString();
  const previous = await getPreviousPerformance(
    routine.exercises.map((e) => e.exercise_id),
    { before }
  );
  const plan = planRoutineStart(routine, previous);
  const startedAt = now.toISOString();
  const workout: Workout = {
    id: Crypto.randomUUID(),
    status: 'active',
    source: 'live',
    name: plan.name,
    date: format(now, 'yyyy-MM-dd'),
    started_at: startedAt,
    ended_at: null,
    duration_seconds: null,
    notes: null,
    routine_id: plan.routine_id,
    created_at: startedAt,
    updated_at: startedAt,
    synced_at: null,
    deleted_at: null,
  };

  const db = await getDatabase();
  try {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await insertWorkout(txn, workout);
      for (let i = 0; i < plan.exercises.length; i++) {
        const ex = plan.exercises[i];
        const link = buildWorkoutExerciseRow(
          { workout_id: workout.id, exercise_id: ex.exercise_id, rest_seconds: ex.rest_seconds },
          i
        );
        await insertWorkoutExercise(txn, link);
        for (let s = 0; s < ex.sets.length; s++) {
          const setRow = buildWorkoutSetRow(
            { ...ex.sets[s], workout_exercise_id: link.id },
            workout.id,
            s
          );
          await insertWorkoutSet(txn, setRow);
        }
      }
    });
  } catch (e) {
    if (e instanceof ActiveWorkoutExistsError) return 'active';
    throw e;
  }

  setActiveWorkout(workout);
  return workout;
}

/**
 * Creates a new `draft` / `manual` workout from a routine (start `now - 1h`, duration 3600s,
 * dated by its start) without touching any existing draft or active workout.
 */
export async function startDraftFromRoutine(
  id: string,
  now: Date = new Date()
): Promise<Workout | 'empty'> {
  const routine = await getRoutineWithExercises(id);
  if (!routine || routine.exercises.length === 0) return 'empty';

  const start = subHours(now, DEFAULT_DRAFT_START_HOURS_AGO);
  const before = new Date(Math.max(now.getTime(), Date.now()) + 1000).toISOString();
  const previous = await getPreviousPerformance(
    routine.exercises.map((e) => e.exercise_id),
    { before }
  );
  const plan = planRoutineStart(routine, previous);
  const nowIso = now.toISOString();
  const workout: Workout = {
    id: Crypto.randomUUID(),
    status: 'draft',
    source: 'manual',
    name: plan.name,
    date: format(start, 'yyyy-MM-dd'),
    started_at: start.toISOString(),
    ended_at: null,
    duration_seconds: DEFAULT_DRAFT_DURATION_SECONDS,
    notes: null,
    routine_id: plan.routine_id,
    created_at: nowIso,
    updated_at: nowIso,
    synced_at: null,
    deleted_at: null,
  };

  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await insertWorkout(txn, workout);
    for (let i = 0; i < plan.exercises.length; i++) {
      const ex = plan.exercises[i];
      const link = buildWorkoutExerciseRow(
        { workout_id: workout.id, exercise_id: ex.exercise_id, rest_seconds: ex.rest_seconds },
        i
      );
      await insertWorkoutExercise(txn, link);
      for (let s = 0; s < ex.sets.length; s++) {
        const setRow = buildWorkoutSetRow(
          { ...ex.sets[s], workout_exercise_id: link.id },
          workout.id,
          s
        );
        await insertWorkoutSet(txn, setRow);
      }
    }
  });

  return workout;
}

// ── Sync reads ─────────────────────────────────────────────────

/** Unsynced routines, tombstones included. */
export async function getUnsyncedRoutines(): Promise<Routine[]> {
  if (typeof getDatabase !== 'function') return [];
  const db = await getDatabase();
  return db.getAllAsync<Routine>(
    'SELECT * FROM routines WHERE synced_at IS NULL ORDER BY created_at'
  );
}

/** Unsynced routine exercises, tombstones included. */
export async function getUnsyncedRoutineExercises(): Promise<RoutineExercise[]> {
  if (typeof getDatabase !== 'function') return [];
  const db = await getDatabase();
  return db.getAllAsync<RoutineExercise>(
    'SELECT * FROM routine_exercises WHERE synced_at IS NULL ORDER BY created_at'
  );
}

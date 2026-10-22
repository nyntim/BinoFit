import * as Crypto from 'expo-crypto';
import type * as SQLite from 'expo-sqlite';
import { getDatabase } from '@/lib/database';
import { markPendingDelete } from '@/lib/health-links';
import { tombstoneSql } from '@/lib/tombstones';

function fireAppleHealthSync(): void {
  void import('@/lib/health-schedule').then((m) => m.scheduleAppleHealthSync());
}
import type {
  Exercise,
  MuscleGroup,
  SetType,
  Workout,
  WorkoutExercise,
  WorkoutExerciseWithSets,
  WorkoutSet,
  WorkoutSource,
  WorkoutStatus,
  WorkoutWithExercises,
} from '@/lib/types';

export const UNKNOWN_EXERCISE_NAME = 'Unknown exercise';

/** Thrown when a second workout would become `active` (one live session at a time). */
export class ActiveWorkoutExistsError extends Error {
  constructor() {
    super('A workout is already in progress');
    this.name = 'ActiveWorkoutExistsError';
  }
}

// ── Row mapping ────────────────────────────────────────────────

export type ExerciseRow = Omit<Exercise, 'primary_muscles' | 'secondary_muscles'> & {
  primary_muscles: string | null;
  secondary_muscles: string | null;
};

export function parseMuscles(value: string | null | undefined): MuscleGroup[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed.filter((m) => typeof m === 'string') as MuscleGroup[]) : [];
  } catch {
    return [];
  }
}

export function mapExerciseRow(row: ExerciseRow): Exercise {
  return {
    ...row,
    primary_muscles: parseMuscles(row.primary_muscles),
    secondary_muscles: parseMuscles(row.secondary_muscles),
  };
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && /UNIQUE constraint failed/i.test(e.message);
}

// ── Workouts ───────────────────────────────────────────────────

export type NewWorkoutInput = {
  date: string;
  /** Default 'draft'. 'active' fails with ActiveWorkoutExistsError if one is already active. */
  status?: WorkoutStatus;
  /** Default 'live'. */
  source?: WorkoutSource;
  name?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  notes?: string | null;
  routine_id?: string | null;
};

export type WorkoutPatch = Partial<
  Pick<
    Workout,
    'status' | 'source' | 'name' | 'date' | 'started_at' | 'ended_at' | 'duration_seconds' | 'notes'
  >
>;

/** Inserts a prepared workout row. Use the `txn` of a transaction to insert several rows together. */
export async function insertWorkout(db: SQLite.SQLiteDatabase, workout: Workout): Promise<void> {
  try {
    await db.runAsync(
      `INSERT INTO workouts
         (id, status, source, name, date, started_at, ended_at, duration_seconds, notes, routine_id,
          created_at, updated_at, synced_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      [
        workout.id,
        workout.status,
        workout.source,
        workout.name,
        workout.date,
        workout.started_at,
        workout.ended_at,
        workout.duration_seconds,
        workout.notes,
        workout.routine_id,
        workout.created_at,
        workout.updated_at,
      ]
    );
  } catch (e) {
    if (isUniqueViolation(e)) throw new ActiveWorkoutExistsError();
    throw e;
  }
}

export async function createWorkout(input: NewWorkoutInput): Promise<Workout> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const workout: Workout = {
    id: Crypto.randomUUID(),
    status: input.status ?? 'draft',
    source: input.source ?? 'live',
    name: input.name ?? null,
    date: input.date,
    started_at: input.started_at ?? null,
    ended_at: input.ended_at ?? null,
    duration_seconds: input.duration_seconds ?? null,
    notes: input.notes ?? null,
    routine_id: input.routine_id ?? null,
    created_at: now,
    updated_at: now,
    synced_at: null,
    deleted_at: null,
  };
  if (workout.status === 'active' && (await getActiveWorkout())) throw new ActiveWorkoutExistsError();
  await insertWorkout(db, workout);
  return workout;
}

export async function getActiveWorkout(): Promise<Workout | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Workout>(
    "SELECT * FROM workouts WHERE status = 'active' AND deleted_at IS NULL LIMIT 1"
  );
}

export async function getWorkout(id: string): Promise<Workout | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Workout>('SELECT * FROM workouts WHERE id = ? AND deleted_at IS NULL', [id]);
}

/**
 * A workout with its live exercises and sets. Exercise definitions are joined without a
 * `deleted_at` filter so past workouts keep the name of a deleted custom exercise; a missing
 * definition shows as "Unknown exercise". Returns null for a missing or deleted workout.
 */
export async function getWorkoutWithExercises(id: string): Promise<WorkoutWithExercises | null> {
  const db = await getDatabase();
  const workout = await db.getFirstAsync<Workout>(
    'SELECT * FROM workouts WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  if (!workout) return null;

  const links = await db.getAllAsync<WorkoutExercise>(
    'SELECT * FROM workout_exercises WHERE workout_id = ? AND deleted_at IS NULL ORDER BY position, created_at',
    [id]
  );
  const sets = await db.getAllAsync<WorkoutSet>(
    'SELECT * FROM workout_sets WHERE workout_id = ? AND deleted_at IS NULL ORDER BY position, created_at',
    [id]
  );
  const exerciseIds = Array.from(new Set(links.map((l) => l.exercise_id)));
  const exercises = new Map<string, Exercise>();
  if (exerciseIds.length > 0) {
    const rows = await db.getAllAsync<ExerciseRow>(
      `SELECT * FROM exercises WHERE id IN (${exerciseIds.map(() => '?').join(',')})`,
      exerciseIds
    );
    for (const r of rows) exercises.set(r.id, mapExerciseRow(r));
  }

  const setsByLink = new Map<string, WorkoutSet[]>();
  for (const s of sets) {
    const list = setsByLink.get(s.workout_exercise_id);
    if (list) list.push(s);
    else setsByLink.set(s.workout_exercise_id, [s]);
  }
  const withSets: WorkoutExerciseWithSets[] = links.map((l) => {
    const exercise = exercises.get(l.exercise_id) ?? null;
    return {
      ...l,
      exercise,
      exercise_name: exercise?.name ?? UNKNOWN_EXERCISE_NAME,
      sets: setsByLink.get(l.id) ?? [],
    };
  });
  return { ...workout, exercises: withSets };
}

const WORKOUT_PATCH_COLUMNS = [
  'status',
  'source',
  'name',
  'date',
  'started_at',
  'ended_at',
  'duration_seconds',
  'notes',
] as const;

/** Applies a patch, bumps updated_at and clears synced_at. Returns the stored row (null if gone). */
export async function updateWorkout(id: string, patch: WorkoutPatch): Promise<Workout | null> {
  const db = await getDatabase();
  if (patch.status === 'draft' || patch.status === 'active') {
    // A done workout may already be on the server; it must be deleted (tombstoned), not reopened.
    const cur = await db.getFirstAsync<{ status: string }>(
      'SELECT status FROM workouts WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (cur?.status === 'done') throw new Error('A finished workout cannot be reopened');
  }
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  for (const col of WORKOUT_PATCH_COLUMNS) {
    if (patch[col] !== undefined) {
      sets.push(`${col} = ?`);
      params.push(patch[col] as string | number | null);
    }
  }
  sets.push('updated_at = ?', 'synced_at = NULL');
  params.push(new Date().toISOString(), id);
  try {
    await db.runAsync(
      `UPDATE workouts SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
      params
    );
  } catch (e) {
    if (isUniqueViolation(e)) throw new ActiveWorkoutExistsError();
    throw e;
  }
  const updated = await getWorkout(id);
  if (updated?.status === 'done') fireAppleHealthSync();
  return updated;
}

// ── Exercises in a workout ─────────────────────────────────────

export type NewWorkoutExerciseInput = {
  /** Client-generated id, so a caller can keep editing the row before the insert finishes. */
  id?: string;
  workout_id: string;
  exercise_id: string;
  rest_seconds?: number | null;
  notes?: string | null;
};

/** The next free position for an exercise in a workout (positions of removed rows are never reused). */
export async function nextExercisePosition(db: SQLite.SQLiteDatabase, workoutId: string): Promise<number> {
  const row = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM workout_exercises WHERE workout_id = ?',
    [workoutId]
  );
  return row?.next ?? 0;
}

/** Builds a workout exercise row without touching the database. */
export function buildWorkoutExerciseRow(input: NewWorkoutExerciseInput, position: number): WorkoutExercise {
  const now = new Date().toISOString();
  return {
    id: input.id ?? Crypto.randomUUID(),
    workout_id: input.workout_id,
    exercise_id: input.exercise_id,
    position,
    rest_seconds: input.rest_seconds ?? null,
    notes: input.notes ?? null,
    created_at: now,
    updated_at: now,
    synced_at: null,
    deleted_at: null,
  };
}

/** Inserts a prepared row. Use the `txn` of a transaction to insert several rows together. */
export async function insertWorkoutExercise(db: SQLite.SQLiteDatabase, row: WorkoutExercise): Promise<void> {
  await db.runAsync(
    `INSERT INTO workout_exercises
       (id, workout_id, exercise_id, position, rest_seconds, notes, created_at, updated_at, synced_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    [row.id, row.workout_id, row.exercise_id, row.position, row.rest_seconds, row.notes, row.created_at, row.updated_at]
  );
}

/** Appends an exercise at the next position. */
export async function addWorkoutExercise(input: NewWorkoutExerciseInput): Promise<WorkoutExercise> {
  const db = await getDatabase();
  const link = buildWorkoutExerciseRow(input, await nextExercisePosition(db, input.workout_id));
  await insertWorkoutExercise(db, link);
  return link;
}

export type WorkoutExercisePatch = { rest_seconds?: number | null; notes?: string | null };

/** Updates the rest and notes of a live workout exercise (bumps updated_at, clears synced_at). */
export async function updateWorkoutExercise(id: string, patch: WorkoutExercisePatch): Promise<void> {
  const db = await getDatabase();
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (patch.rest_seconds !== undefined) {
    sets.push('rest_seconds = ?');
    params.push(patch.rest_seconds);
  }
  if (patch.notes !== undefined) {
    sets.push('notes = ?');
    params.push(patch.notes);
  }
  sets.push('updated_at = ?', 'synced_at = NULL');
  params.push(new Date().toISOString(), id);
  await db.runAsync(
    `UPDATE workout_exercises SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    params
  );
}

async function isWorkoutDone(db: SQLite.SQLiteDatabase, workoutId: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ status: string }>('SELECT status FROM workouts WHERE id = ?', [
    workoutId,
  ]);
  return row?.status === 'done';
}

/**
 * Removes an exercise and its sets. Hard delete for active/draft workouts (they never sync);
 * tombstones for a done workout.
 */
export async function removeWorkoutExercise(id: string): Promise<void> {
  const db = await getDatabase();
  const link = await db.getFirstAsync<{ workout_id: string }>(
    'SELECT workout_id FROM workout_exercises WHERE id = ?',
    [id]
  );
  if (!link) return;
  const done = await isWorkoutDone(db, link.workout_id);
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (txn) => {
    if (done) {
      await txn.runAsync(`${tombstoneSql('workout_sets')} WHERE workout_exercise_id = ? AND deleted_at IS NULL`, [
        now,
        now,
        id,
      ]);
      await txn.runAsync(`${tombstoneSql('workout_exercises')} WHERE id = ? AND deleted_at IS NULL`, [
        now,
        now,
        id,
      ]);
    } else {
      await txn.runAsync('DELETE FROM workout_sets WHERE workout_exercise_id = ?', [id]);
      await txn.runAsync('DELETE FROM workout_exercises WHERE id = ?', [id]);
    }
  });
}

// ── Sets ───────────────────────────────────────────────────────

export type SetValues = {
  set_type?: SetType;
  weight_kg?: number | null;
  reps?: number | null;
  duration_seconds?: number | null;
  distance_m?: number | null;
  rpe?: number | null;
  rir?: number | null;
  completed_at?: string | null;
};

export type NewWorkoutSetInput = SetValues & {
  /** Client-generated id, so a caller can edit the set before the insert finishes. */
  id?: string;
  workout_exercise_id: string;
};

/** The next free position for a set in a workout exercise. */
export async function nextSetPosition(db: SQLite.SQLiteDatabase, workoutExerciseId: string): Promise<number> {
  const row = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM workout_sets WHERE workout_exercise_id = ?',
    [workoutExerciseId]
  );
  return row?.next ?? 0;
}

/** Builds a set row without touching the database. */
export function buildWorkoutSetRow(
  input: NewWorkoutSetInput,
  workoutId: string,
  position: number
): WorkoutSet {
  const now = new Date().toISOString();
  return {
    id: input.id ?? Crypto.randomUUID(),
    workout_id: workoutId,
    workout_exercise_id: input.workout_exercise_id,
    position,
    set_type: input.set_type ?? 'normal',
    weight_kg: input.weight_kg ?? null,
    reps: input.reps ?? null,
    duration_seconds: input.duration_seconds ?? null,
    distance_m: input.distance_m ?? null,
    rpe: input.rpe ?? null,
    rir: input.rir ?? null,
    completed_at: input.completed_at ?? null,
    created_at: now,
    updated_at: now,
    synced_at: null,
    deleted_at: null,
  };
}

/** Inserts a prepared row. Use the `txn` of a transaction to insert several rows together. */
export async function insertWorkoutSet(db: SQLite.SQLiteDatabase, set: WorkoutSet): Promise<void> {
  await db.runAsync(
    `INSERT INTO workout_sets
       (id, workout_id, workout_exercise_id, position, set_type, weight_kg, reps, duration_seconds,
        distance_m, rpe, rir, completed_at, created_at, updated_at, synced_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    [
      set.id,
      set.workout_id,
      set.workout_exercise_id,
      set.position,
      set.set_type,
      set.weight_kg,
      set.reps,
      set.duration_seconds,
      set.distance_m,
      set.rpe,
      set.rir,
      set.completed_at,
      set.created_at,
      set.updated_at,
    ]
  );
}

/** Appends a set to a workout exercise (workout_id is taken from the exercise row). */
export async function addWorkoutSet(input: NewWorkoutSetInput): Promise<WorkoutSet> {
  const db = await getDatabase();
  const link = await db.getFirstAsync<{ workout_id: string }>(
    'SELECT workout_id FROM workout_exercises WHERE id = ? AND deleted_at IS NULL',
    [input.workout_exercise_id]
  );
  if (!link) throw new Error('Workout exercise not found');
  const set = buildWorkoutSetRow(input, link.workout_id, await nextSetPosition(db, input.workout_exercise_id));
  await insertWorkoutSet(db, set);
  return set;
}

const SET_PATCH_COLUMNS = [
  'set_type',
  'weight_kg',
  'reps',
  'duration_seconds',
  'distance_m',
  'rpe',
  'rir',
  'completed_at',
] as const;

/** Applies a patch to a live set, bumps updated_at and clears synced_at. */
export async function updateWorkoutSet(id: string, patch: SetValues): Promise<void> {
  const db = await getDatabase();
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  for (const col of SET_PATCH_COLUMNS) {
    if (patch[col] !== undefined) {
      sets.push(`${col} = ?`);
      params.push(patch[col] as string | number | null);
    }
  }
  sets.push('updated_at = ?', 'synced_at = NULL');
  params.push(new Date().toISOString(), id);
  await db.runAsync(`UPDATE workout_sets SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`, params);
}

/** Hard delete for active/draft workouts; tombstone for a done workout. */
export async function deleteWorkoutSet(id: string): Promise<void> {
  const db = await getDatabase();
  const set = await db.getFirstAsync<{ workout_id: string }>(
    'SELECT workout_id FROM workout_sets WHERE id = ?',
    [id]
  );
  if (!set) return;
  if (await isWorkoutDone(db, set.workout_id)) {
    const now = new Date().toISOString();
    await db.runAsync(`${tombstoneSql('workout_sets')} WHERE id = ? AND deleted_at IS NULL`, [now, now, id]);
  } else {
    await db.runAsync('DELETE FROM workout_sets WHERE id = ?', [id]);
  }
}

// ── Deleting workouts ──────────────────────────────────────────

async function hardDeleteTree(txn: SQLite.SQLiteDatabase, id: string): Promise<void> {
  await txn.runAsync('DELETE FROM workout_sets WHERE workout_id = ?', [id]);
  await txn.runAsync('DELETE FROM workout_exercises WHERE workout_id = ?', [id]);
  await txn.runAsync('DELETE FROM workouts WHERE id = ?', [id]);
}

/**
 * Deletes a workout. Active and draft workouts never sync, so their tree is hard-deleted; a done
 * workout and its children are tombstoned so the deletion syncs.
 */
export async function deleteWorkout(id: string): Promise<void> {
  const db = await getDatabase();
  const w = await db.getFirstAsync<{ status: WorkoutStatus }>('SELECT status FROM workouts WHERE id = ?', [id]);
  if (!w) return;
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (txn) => {
    if (w.status !== 'done') {
      await hardDeleteTree(txn, id);
      return;
    }
    await txn.runAsync(`${tombstoneSql('workout_sets')} WHERE workout_id = ? AND deleted_at IS NULL`, [now, now, id]);
    await txn.runAsync(`${tombstoneSql('workout_exercises')} WHERE workout_id = ? AND deleted_at IS NULL`, [
      now,
      now,
      id,
    ]);
    await txn.runAsync(`${tombstoneSql('workouts')} WHERE id = ? AND deleted_at IS NULL`, [now, now, id]);
  });
  if (w.status === 'done') {
    await markPendingDelete('workout', id);
    fireAppleHealthSync();
  }
}

/** Throws away an active or draft session. Throws for a done workout (use deleteWorkout). */
export async function discardWorkout(id: string): Promise<void> {
  const db = await getDatabase();
  const w = await db.getFirstAsync<{ status: string }>('SELECT status FROM workouts WHERE id = ?', [id]);
  if (w?.status === 'done') throw new Error('A finished workout must be deleted, not discarded');
  await db.withExclusiveTransactionAsync(async (txn) => {
    await hardDeleteTree(txn, id);
  });
}

// ── Sync reads ─────────────────────────────────────────────────

/** Custom exercises not yet pushed (tombstones included). Seeds never sync. */
export async function getUnsyncedCustomExercises(): Promise<Exercise[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ExerciseRow>(
    "SELECT * FROM exercises WHERE source = 'custom' AND synced_at IS NULL ORDER BY created_at"
  );
  return rows.map(mapExerciseRow);
}

/** Done workouts not yet pushed (tombstones included). Active and draft sessions never sync. */
export async function getUnsyncedWorkouts(): Promise<Workout[]> {
  const db = await getDatabase();
  return db.getAllAsync<Workout>(
    "SELECT * FROM workouts WHERE status = 'done' AND synced_at IS NULL ORDER BY created_at"
  );
}

/**
 * Unsynced children: the parent workout is done, or the child itself is a tombstone (so a child
 * tombstone still pushes after its parent was purged).
 */
export async function getUnsyncedWorkoutExercises(): Promise<WorkoutExercise[]> {
  const db = await getDatabase();
  return db.getAllAsync<WorkoutExercise>(
    `SELECT c.* FROM workout_exercises c
      WHERE c.synced_at IS NULL
        AND (c.deleted_at IS NOT NULL
             OR EXISTS (SELECT 1 FROM workouts w WHERE w.id = c.workout_id AND w.status = 'done'))
      ORDER BY c.created_at`
  );
}

export async function getUnsyncedWorkoutSets(): Promise<WorkoutSet[]> {
  const db = await getDatabase();
  return db.getAllAsync<WorkoutSet>(
    `SELECT c.* FROM workout_sets c
      WHERE c.synced_at IS NULL
        AND (c.deleted_at IS NOT NULL
             OR EXISTS (SELECT 1 FROM workouts w WHERE w.id = c.workout_id AND w.status = 'done'))
      ORDER BY c.created_at`
  );
}

export type UnsyncedWorkoutTree = {
  exercises: Exercise[];
  workouts: Workout[];
  workoutExercises: WorkoutExercise[];
  sets: WorkoutSet[];
};

/** Snapshot of all four unsynced sets, read together before a push. */
export async function getUnsyncedWorkoutTree(): Promise<UnsyncedWorkoutTree> {
  const exercises = await getUnsyncedCustomExercises();
  const workouts = await getUnsyncedWorkouts();
  const workoutExercises = await getUnsyncedWorkoutExercises();
  const sets = await getUnsyncedWorkoutSets();
  return { exercises, workouts, workoutExercises, sets };
}

/**
 * Removes pushed exercise tombstones that no workout or routine exercise references. Referenced
 * ones stay so past workouts and routines keep the deleted exercise's name.
 */
export async function purgeSyncedExerciseTombstones(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `DELETE FROM exercises
      WHERE deleted_at IS NOT NULL AND synced_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM workout_exercises we WHERE we.exercise_id = exercises.id)
        AND NOT EXISTS (SELECT 1 FROM routine_exercises re WHERE re.exercise_id = exercises.id)`
  );
}

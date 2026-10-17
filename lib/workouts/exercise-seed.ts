import type * as SQLite from 'expo-sqlite';
import type { Equipment, ExerciseLogType, MuscleGroup } from '@/lib/types';

/** Bump when SEED_EXERCISES changes; `seedExercises` reruns only when the stored version is lower. */
export const EXERCISE_SEED_VERSION = 1;
export const EXERCISE_SEED_VERSION_KEY = 'exercise_seed_version';

export type SeedExercise = {
  id: string;
  name: string;
  /** Spec group (docs/phase-4-training.md). Must equal MUSCLE_REGION[primary[0]]. */
  group: 'Chest' | 'Back' | 'Shoulders' | 'Arms' | 'Legs' | 'Core' | 'Cardio';
  log_type: ExerciseLogType;
  primary_muscles: MuscleGroup[];
  secondary_muscles: MuscleGroup[];
  equipment: Equipment;
  per_side: 0 | 1;
  default_rest_seconds: number | null;
  /** Metabolic equivalent (Compendium of Physical Activities), for the later burn estimate. */
  met: number;
};

type Row = [
  id: string,
  name: string,
  group: SeedExercise['group'],
  log: ExerciseLogType,
  primary: MuscleGroup[],
  secondary: MuscleGroup[],
  equipment: Equipment,
  perSide: 0 | 1,
  rest: number | null,
  met: number,
];

const W: ExerciseLogType = 'weight_reps';
const BW: ExerciseLogType = 'bodyweight_reps';
const T: ExerciseLogType = 'duration';
const D: ExerciseLogType = 'distance_duration';

// prettier-ignore
const ROWS: Row[] = [
  // Chest (7)
  ['barbell-bench-press', 'Barbell bench press', 'Chest', W, ['chest'], ['triceps', 'front_delts'], 'barbell', 0, 150, 6],
  ['incline-barbell-bench-press', 'Incline barbell bench press', 'Chest', W, ['chest'], ['front_delts', 'triceps'], 'barbell', 0, 150, 6],
  ['dumbbell-bench-press', 'Dumbbell bench press', 'Chest', W, ['chest'], ['triceps', 'front_delts'], 'dumbbell', 0, 120, 5],
  ['incline-dumbbell-press', 'Incline dumbbell press', 'Chest', W, ['chest'], ['front_delts', 'triceps'], 'dumbbell', 0, 120, 5],
  ['dumbbell-fly', 'Dumbbell fly', 'Chest', W, ['chest'], ['front_delts'], 'dumbbell', 0, 90, 3.5],
  ['push-up', 'Push-up', 'Chest', BW, ['chest'], ['triceps', 'front_delts'], 'bodyweight', 0, 90, 3.8],
  ['dip', 'Dip', 'Chest', BW, ['chest'], ['triceps', 'front_delts'], 'bodyweight', 0, 120, 5],
  // Back (7)
  ['deadlift', 'Deadlift', 'Back', W, ['lower_back'], ['glutes', 'hamstrings', 'upper_back'], 'barbell', 0, 180, 6],
  ['pull-up', 'Pull-up', 'Back', BW, ['lats'], ['biceps', 'upper_back'], 'bodyweight', 0, 120, 4],
  ['chin-up', 'Chin-up', 'Back', BW, ['lats'], ['biceps', 'upper_back'], 'bodyweight', 0, 120, 4],
  ['lat-pulldown', 'Lat pulldown', 'Back', W, ['lats'], ['biceps', 'upper_back'], 'cable', 0, 90, 4],
  ['barbell-row', 'Barbell row', 'Back', W, ['upper_back'], ['lats', 'biceps', 'lower_back'], 'barbell', 0, 120, 5],
  ['dumbbell-row', 'Dumbbell row', 'Back', W, ['lats'], ['upper_back', 'biceps'], 'dumbbell', 1, 90, 4.5],
  ['seated-cable-row', 'Seated cable row', 'Back', W, ['upper_back'], ['lats', 'biceps'], 'cable', 0, 90, 4.5],
  // Shoulders (5)
  ['overhead-press', 'Overhead press', 'Shoulders', W, ['front_delts'], ['triceps', 'side_delts'], 'barbell', 0, 150, 5],
  ['dumbbell-shoulder-press', 'Dumbbell shoulder press', 'Shoulders', W, ['front_delts'], ['triceps', 'side_delts'], 'dumbbell', 0, 120, 5],
  ['lateral-raise', 'Lateral raise', 'Shoulders', W, ['side_delts'], [], 'dumbbell', 0, 60, 3.5],
  ['rear-delt-fly', 'Rear delt fly', 'Shoulders', W, ['rear_delts'], ['upper_back'], 'dumbbell', 0, 60, 3.5],
  ['face-pull', 'Face pull', 'Shoulders', W, ['rear_delts'], ['upper_back', 'side_delts'], 'cable', 0, 60, 3.5],
  // Arms (6)
  ['barbell-curl', 'Barbell curl', 'Arms', W, ['biceps'], ['forearms'], 'barbell', 0, 75, 3.5],
  ['dumbbell-curl', 'Dumbbell curl', 'Arms', W, ['biceps'], ['forearms'], 'dumbbell', 0, 75, 3.5],
  ['hammer-curl', 'Hammer curl', 'Arms', W, ['biceps'], ['forearms'], 'dumbbell', 0, 75, 3.5],
  ['triceps-pushdown', 'Triceps pushdown', 'Arms', W, ['triceps'], [], 'cable', 0, 75, 3.5],
  ['overhead-triceps-extension', 'Overhead triceps extension', 'Arms', W, ['triceps'], [], 'dumbbell', 0, 75, 3.5],
  ['skull-crusher', 'Skull crusher', 'Arms', W, ['triceps'], [], 'barbell', 0, 75, 3.5],
  // Legs (10)
  ['back-squat', 'Back squat', 'Legs', W, ['quads'], ['glutes', 'hamstrings', 'lower_back'], 'barbell', 0, 180, 6],
  ['front-squat', 'Front squat', 'Legs', W, ['quads'], ['glutes', 'abs'], 'barbell', 0, 180, 6],
  ['romanian-deadlift', 'Romanian deadlift', 'Legs', W, ['hamstrings'], ['glutes', 'lower_back'], 'barbell', 0, 150, 6],
  ['leg-press', 'Leg press', 'Legs', W, ['quads'], ['glutes', 'hamstrings'], 'machine', 0, 150, 5],
  ['bulgarian-split-squat', 'Bulgarian split squat', 'Legs', W, ['quads'], ['glutes'], 'dumbbell', 1, 90, 5],
  ['walking-lunge', 'Walking lunge', 'Legs', W, ['quads'], ['glutes', 'hamstrings'], 'dumbbell', 1, 90, 5],
  ['leg-extension', 'Leg extension', 'Legs', W, ['quads'], [], 'machine', 0, 75, 3.5],
  ['leg-curl', 'Leg curl', 'Legs', W, ['hamstrings'], [], 'machine', 0, 75, 3.5],
  ['hip-thrust', 'Hip thrust', 'Legs', W, ['glutes'], ['hamstrings'], 'barbell', 0, 120, 5],
  ['standing-calf-raise', 'Standing calf raise', 'Legs', W, ['calves'], [], 'machine', 0, 60, 3.5],
  // Core (3)
  ['plank', 'Plank', 'Core', T, ['abs'], ['lower_back'], 'bodyweight', 0, 60, 3.8],
  ['hanging-leg-raise', 'Hanging leg raise', 'Core', BW, ['abs'], ['forearms'], 'bodyweight', 0, 75, 4],
  ['cable-crunch', 'Cable crunch', 'Core', W, ['abs'], [], 'cable', 0, 75, 3.5],
  // Cardio (8)
  ['run', 'Run', 'Cardio', D, ['cardio'], [], 'bodyweight', 0, null, 9.8],
  ['walk', 'Walk', 'Cardio', D, ['cardio'], [], 'bodyweight', 0, null, 3.5],
  ['cycle', 'Cycle', 'Cardio', D, ['cardio'], [], 'cardio_machine', 0, null, 7.5],
  ['row', 'Row', 'Cardio', D, ['cardio'], [], 'cardio_machine', 0, null, 7],
  ['elliptical', 'Elliptical', 'Cardio', T, ['cardio'], [], 'cardio_machine', 0, null, 5],
  ['stair-climber', 'Stair climber', 'Cardio', T, ['cardio'], [], 'cardio_machine', 0, null, 9],
  ['swim', 'Swim', 'Cardio', D, ['cardio'], [], 'bodyweight', 0, null, 5.8],
  ['jump-rope', 'Jump rope', 'Cardio', T, ['cardio'], [], 'other', 0, null, 11.8],
];

export const SEED_EXERCISES: readonly SeedExercise[] = ROWS.map(
  ([id, name, group, log_type, primary_muscles, secondary_muscles, equipment, per_side, rest, met]) => ({
    id,
    name,
    group,
    log_type,
    primary_muscles,
    secondary_muscles,
    equipment,
    per_side,
    default_rest_seconds: rest,
    met,
  })
);

/**
 * Inserts or updates the built-in exercises when `app_meta.exercise_seed_version` is below
 * EXERCISE_SEED_VERSION, in one transaction. Only `source = 'seed'` rows are ever overwritten;
 * custom rows and `synced_at` are left alone. Seed ids that were dropped from the list are hidden.
 * Does nothing when already current, so it is safe to call on every launch.
 */
export async function seedExercises(db: SQLite.SQLiteDatabase): Promise<void> {
  try {
    await seedExercisesUnsafe(db);
  } catch (e) {
    // A bad seed must never stop the database opening. The version is not bumped (the transaction
    // rolled back), so the next launch tries again.
    console.warn('Exercise seed failed', e);
  }
}

async function seedExercisesUnsafe(db: SQLite.SQLiteDatabase): Promise<void> {
  const stored = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM app_meta WHERE key = ?',
    [EXERCISE_SEED_VERSION_KEY]
  );
  if (stored && Number(stored.value) >= EXERCISE_SEED_VERSION) return;

  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const e of SEED_EXERCISES) {
      await txn.runAsync(
        `INSERT INTO exercises
           (id, name, log_type, primary_muscles, secondary_muscles, equipment, brand, load_type,
            base_weight_kg, per_side, setup_notes, default_rest_seconds, met, source, hidden,
            created_at, updated_at, synced_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?, ?, 'seed', 0, ?, ?, NULL, NULL)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           log_type = excluded.log_type,
           primary_muscles = excluded.primary_muscles,
           secondary_muscles = excluded.secondary_muscles,
           equipment = excluded.equipment,
           per_side = excluded.per_side,
           default_rest_seconds = excluded.default_rest_seconds,
           met = excluded.met,
           hidden = 0,
           updated_at = excluded.updated_at
         WHERE exercises.source = 'seed'`,
        [
          e.id,
          e.name,
          e.log_type,
          JSON.stringify(e.primary_muscles),
          JSON.stringify(e.secondary_muscles),
          e.equipment,
          e.per_side,
          e.default_rest_seconds,
          e.met,
          now,
          now,
        ]
      );
    }
    const keep = SEED_EXERCISES.map(() => '?').join(',');
    await txn.runAsync(
      `UPDATE exercises SET hidden = 1, updated_at = ?
        WHERE source = 'seed' AND hidden = 0 AND id NOT IN (${keep})`,
      [now, ...SEED_EXERCISES.map((e) => e.id)]
    );
    await txn.runAsync(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [EXERCISE_SEED_VERSION_KEY, String(EXERCISE_SEED_VERSION)]
    );
  });
}

import type * as SQLite from 'expo-sqlite';

/**
 * Creates the workout tables. Safe to run on every launch (all statements are IF NOT EXISTS) and
 * never touches existing user data. Called at the end of `initSchema` in lib/database.ts.
 *
 * Units: kg, metres, seconds. Dates are yyyy-MM-dd local, times ISO. Muscles are JSON arrays.
 */
export async function initWorkoutSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      log_type TEXT NOT NULL,
      primary_muscles TEXT NOT NULL DEFAULT '[]',
      secondary_muscles TEXT NOT NULL DEFAULT '[]',
      equipment TEXT NOT NULL,
      brand TEXT,
      load_type TEXT,
      base_weight_kg REAL,
      per_side INTEGER NOT NULL DEFAULT 0,
      setup_notes TEXT,
      default_rest_seconds INTEGER,
      met REAL,
      source TEXT NOT NULL DEFAULT 'custom',
      hidden INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'live',
      name TEXT,
      date TEXT NOT NULL,
      started_at TEXT,
      ended_at TEXT,
      duration_seconds INTEGER,
      notes TEXT,
      routine_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS workout_exercises (
      id TEXT PRIMARY KEY,
      workout_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      rest_seconds INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS workout_sets (
      id TEXT PRIMARY KEY,
      workout_id TEXT NOT NULL,
      workout_exercise_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      set_type TEXT NOT NULL DEFAULT 'normal',
      weight_kg REAL,
      reps INTEGER,
      duration_seconds INTEGER,
      distance_m REAL,
      rpe REAL,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_exercises_name ON exercises(name);
    CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date);
    CREATE INDEX IF NOT EXISTS idx_workouts_status_started ON workouts(status, started_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_workouts_one_active
      ON workouts(status) WHERE status = 'active' AND deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout ON workout_exercises(workout_id, position);
    CREATE INDEX IF NOT EXISTS idx_workout_exercises_exercise ON workout_exercises(exercise_id);
    CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise ON workout_sets(workout_exercise_id, position);
    CREATE INDEX IF NOT EXISTS idx_workout_sets_workout ON workout_sets(workout_id);
  `);
}

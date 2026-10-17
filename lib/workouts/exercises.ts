import * as Crypto from 'expo-crypto';
import { getDatabase } from '@/lib/database';
import { tombstoneSql } from '@/lib/tombstones';
import { mapExerciseRow } from '@/lib/workouts/db';
import type { ExerciseInput } from '@/lib/workouts/exercise-builder';
import type { Exercise } from '@/lib/types';

type ExerciseRow = Parameters<typeof mapExerciseRow>[0];

/** Live exercises (seeds and custom, hidden seeds included; filter with `filterExercises`). */
export async function getExercises(): Promise<Exercise[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ExerciseRow>(
    'SELECT * FROM exercises WHERE deleted_at IS NULL ORDER BY name'
  );
  return rows.map(mapExerciseRow);
}

/** An exercise by id, including a tombstoned one (past workouts still show its name). */
export async function getExerciseById(id: string): Promise<Exercise | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ExerciseRow>('SELECT * FROM exercises WHERE id = ?', [id]);
  return row ? mapExerciseRow(row) : null;
}

/** Inserts a custom exercise. Default rest and MET stay null (the 90 s fallback applies). */
export async function createCustomExercise(input: ExerciseInput): Promise<Exercise> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const exercise: Exercise = {
    id: Crypto.randomUUID(),
    ...input,
    default_rest_seconds: null,
    met: null,
    source: 'custom',
    hidden: 0,
    created_at: now,
    updated_at: now,
    synced_at: null,
    deleted_at: null,
  };
  await db.runAsync(
    `INSERT INTO exercises
       (id, name, log_type, primary_muscles, secondary_muscles, equipment, brand, load_type,
        base_weight_kg, per_side, setup_notes, default_rest_seconds, met, source, hidden,
        created_at, updated_at, synced_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'custom', 0, ?, ?, NULL, NULL)`,
    [
      exercise.id,
      input.name,
      input.log_type,
      JSON.stringify(input.primary_muscles),
      JSON.stringify(input.secondary_muscles),
      input.equipment,
      input.brand,
      input.load_type,
      input.base_weight_kg,
      input.per_side,
      input.setup_notes,
      now,
      now,
    ]
  );
  return exercise;
}

/** Updates a live custom exercise (bumps updated_at, clears synced_at). Null if there is none. */
export async function updateCustomExercise(id: string, input: ExerciseInput): Promise<Exercise | null> {
  const db = await getDatabase();
  const current = await getExerciseById(id);
  if (!current || current.source !== 'custom' || current.deleted_at) return null;
  await db.runAsync(
    `UPDATE exercises SET
       name = ?, log_type = ?, primary_muscles = ?, secondary_muscles = ?, equipment = ?, brand = ?,
       load_type = ?, base_weight_kg = ?, per_side = ?, setup_notes = ?,
       updated_at = ?, synced_at = NULL
     WHERE id = ? AND source = 'custom' AND deleted_at IS NULL`,
    [
      input.name,
      input.log_type,
      JSON.stringify(input.primary_muscles),
      JSON.stringify(input.secondary_muscles),
      input.equipment,
      input.brand,
      input.load_type,
      input.base_weight_kg,
      input.per_side,
      input.setup_notes,
      new Date().toISOString(),
      id,
    ]
  );
  const row = await getExerciseById(id);
  return row && !row.deleted_at ? row : null;
}

/** Tombstones a custom exercise. Seeds are never deleted. */
export async function deleteCustomExercise(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(`${tombstoneSql('exercises')} WHERE id = ? AND source = 'custom' AND deleted_at IS NULL`, [
    now,
    now,
    id,
  ]);
}

/** Distinct brands on live custom exercises (case-insensitive), most recently used first. */
export async function getCustomExerciseBrands(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ brand: string }>(
    `SELECT brand, MAX(updated_at) AS last_used FROM exercises
      WHERE source = 'custom' AND deleted_at IS NULL AND brand IS NOT NULL AND TRIM(brand) <> ''
      GROUP BY LOWER(TRIM(brand))
      ORDER BY last_used DESC`
  );
  return rows.map((r) => r.brand.trim());
}

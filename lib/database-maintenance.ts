import { getDatabase, seedDefaultMeals } from '@/lib/database-connection';

/** Of the given food ids, those with no row in the local foods table. */
export async function getMissingFoodIds(ids: string[]): Promise<string[]> {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return [];
  const db = await getDatabase();
  const present = new Set<string>();
  const BATCH = 500;
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM foods WHERE id IN (${batch.map(() => '?').join(', ')})`,
      batch
    );
    rows.forEach((r) => present.add(r.id));
  }
  return unique.filter((id) => !present.has(id));
}

/**
 * Empties everything a user owns on the device: logs, confirmations, water logs, meals and
 * names, and custom foods. Cached remote foods and USDA foods stay. Default meals are reseeded.
 */
export async function clearUserData(): Promise<void> {
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM food_logs');
    await txn.runAsync('DELETE FROM weight_entries');
    await txn.runAsync('DELETE FROM health_links');
    await txn.runAsync('DELETE FROM meal_slot_confirmations');
    await txn.runAsync('DELETE FROM water_logs');
    await txn.runAsync('DELETE FROM meal_names');
    await txn.runAsync('DELETE FROM meal_definitions');
    await txn.runAsync("DELETE FROM foods WHERE source = 'custom'");
    // Workouts: seeds stay, custom exercises go.
    await txn.runAsync('DELETE FROM workout_sets');
    await txn.runAsync('DELETE FROM workout_exercises');
    await txn.runAsync('DELETE FROM workouts');
    await txn.runAsync('DELETE FROM routine_exercises');
    await txn.runAsync('DELETE FROM routines');
    await txn.runAsync("DELETE FROM exercises WHERE source = 'custom'");
  });
  await seedDefaultMeals(db);
}

/** Clears every synced_at so the next sync pushes all rows (used when the owning user id changes). */
export async function markAllUnsynced(): Promise<void> {
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync("UPDATE foods SET synced_at = NULL WHERE source = 'custom'");
    await txn.runAsync('UPDATE food_logs SET synced_at = NULL');
    await txn.runAsync('UPDATE weight_entries SET synced_at = NULL');
    await txn.runAsync('UPDATE meal_definitions SET synced_at = NULL');
    await txn.runAsync('UPDATE meal_names SET synced_at = NULL');
    await txn.runAsync('UPDATE exercises SET synced_at = NULL');
    await txn.runAsync('UPDATE workouts SET synced_at = NULL');
    await txn.runAsync('UPDATE workout_exercises SET synced_at = NULL');
    await txn.runAsync('UPDATE workout_sets SET synced_at = NULL');
    await txn.runAsync('UPDATE routines SET synced_at = NULL');
    await txn.runAsync('UPDATE routine_exercises SET synced_at = NULL');
  });
}

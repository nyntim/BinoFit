import * as Crypto from 'expo-crypto';
import type {
  MealDefinition,
  MealId,
  MealNameEntry,
  MealSlot,
  MealSlotConfirmation,
  RemoteMealDefinition,
  RemoteMealName,
} from '@/lib/types';
import { tombstoneSql } from '@/lib/tombstones';
import { nameForDate, type MealDraft } from '@/lib/meals';
import { fireAppleHealthSync, getDatabase } from '@/lib/database-connection';
import { toIso } from '@/lib/database-food-logs';

export async function getMealSlotConfirmationsByDate(date: string): Promise<MealSlotConfirmation[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    date: string;
    meal_slot: MealSlot;
    confirmed: number;
    updated_at: string;
  }>('SELECT * FROM meal_slot_confirmations WHERE date = ?', [date]);
  return rows.map((r) => ({
    ...r,
    confirmed: r.confirmed === 1,
  }));
}

export async function upsertMealSlotConfirmation(
  date: string,
  meal_slot: MealSlot,
  confirmed: boolean
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const id = Crypto.randomUUID();
  const confirmedInt = confirmed ? 1 : 0;

  await db.runAsync(
    `INSERT INTO meal_slot_confirmations (id, date, meal_slot, confirmed, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date, meal_slot) DO UPDATE SET
       confirmed = EXCLUDED.confirmed,
       updated_at = EXCLUDED.updated_at`,
    [id, date, meal_slot, confirmedInt, now]
  );
  fireAppleHealthSync();
}

/**
 * Creates the slot's status row only if none exists (an existing status is kept).
 * Returns whether the slot is eaten afterwards.
 */
export async function ensureMealSlotStatus(
  date: string,
  meal_slot: MealSlot,
  confirmed: boolean
): Promise<boolean> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO meal_slot_confirmations (id, date, meal_slot, confirmed, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date, meal_slot) DO NOTHING`,
    [Crypto.randomUUID(), date, meal_slot, confirmed ? 1 : 0, now]
  );
  const row = await db.getFirstAsync<{ confirmed: number }>(
    'SELECT confirmed FROM meal_slot_confirmations WHERE date = ? AND meal_slot = ?',
    [date, meal_slot]
  );
  return row ? row.confirmed === 1 : true;
}

export async function deleteMealSlotConfirmation(date: string, meal_slot: MealSlot): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'DELETE FROM meal_slot_confirmations WHERE date = ? AND meal_slot = ?',
    [date, meal_slot]
  );
  fireAppleHealthSync();
}

/** Meal status rows between two yyyy-MM-dd dates, inclusive. A null bound is open. */
export async function getMealSlotConfirmationsInRange(
  start: string | null,
  end: string | null
): Promise<MealSlotConfirmation[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    date: string;
    meal_slot: MealSlot;
    confirmed: number;
    updated_at: string;
  }>(
    `SELECT * FROM meal_slot_confirmations
     WHERE (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?)`,
    [start, start, end, end]
  );
  return rows.map((r) => ({ ...r, confirmed: r.confirmed === 1 }));
}

export async function getMealDefinitions(): Promise<MealDefinition[]> {
  const db = await getDatabase();
  return db.getAllAsync<MealDefinition>('SELECT * FROM meal_definitions ORDER BY position');
}

export async function getMealNames(): Promise<MealNameEntry[]> {
  const db = await getDatabase();
  return db.getAllAsync<MealNameEntry>('SELECT * FROM meal_names ORDER BY meal_id, effective_from');
}

/** Number of food logs on every date for a meal. */
export async function countFoodLogsForMeal(id: MealId): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM food_logs WHERE meal_slot = ? AND deleted_at IS NULL',
    [id]
  );
  return row?.c ?? 0;
}

/**
 * Applies an edit-mode draft in one transaction: deletes (a meal's food logs on every date,
 * its status rows, names and definition), adds, positions, targets, and renames (a name
 * history row effective `today`; renaming twice on one day overwrites that day's row).
 *
 * Sync gap: deletions are not propagated to Supabase for meal_definitions / meal_names
 * (same as other tables). Food logs of a deleted meal are tombstoned and sync as deletions.
 */
export async function saveMealDraft(draft: MealDraft, today: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const id of draft.deletedIds) {
      await txn.runAsync(`${tombstoneSql('food_logs')} WHERE meal_slot = ? AND deleted_at IS NULL`, [
        now,
        now,
        id,
      ]);
      await txn.runAsync('DELETE FROM meal_slot_confirmations WHERE meal_slot = ?', [id]);
      await txn.runAsync('DELETE FROM meal_names WHERE meal_id = ?', [id]);
      await txn.runAsync('DELETE FROM meal_definitions WHERE id = ?', [id]);
    }

    const nameRows = await txn.getAllAsync<MealNameEntry>('SELECT * FROM meal_names');

    for (let i = 0; i < draft.meals.length; i++) {
      const m = draft.meals[i];
      // Only rows that actually changed are touched (and re-marked unsynced).
      await txn.runAsync(
        `INSERT INTO meal_definitions
           (id, position, calorie_target, protein_target, carb_target, fat_target, reminder_time, created_at, updated_at, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           position = excluded.position,
           calorie_target = excluded.calorie_target,
           protein_target = excluded.protein_target,
           carb_target = excluded.carb_target,
           fat_target = excluded.fat_target,
           reminder_time = excluded.reminder_time,
           updated_at = excluded.updated_at,
           synced_at = NULL
         WHERE meal_definitions.position IS NOT excluded.position
            OR meal_definitions.calorie_target IS NOT excluded.calorie_target
            OR meal_definitions.protein_target IS NOT excluded.protein_target
            OR meal_definitions.carb_target IS NOT excluded.carb_target
            OR meal_definitions.fat_target IS NOT excluded.fat_target
            OR meal_definitions.reminder_time IS NOT excluded.reminder_time`,
        [m.id, i, m.calorie_target, m.protein_target, m.carb_target, m.fat_target, m.reminder_time, now, now]
      );

      const name = m.name.trim();
      if (m.isNew || name !== nameForDate(nameRows, m.id, today)) {
        await txn.runAsync(
          `INSERT INTO meal_names (meal_id, name, effective_from, updated_at, synced_at)
           VALUES (?, ?, ?, ?, NULL)
           ON CONFLICT(meal_id, effective_from) DO UPDATE SET
             name = excluded.name,
             updated_at = excluded.updated_at,
             synced_at = NULL`,
          [m.id, name, today, now]
        );
      }
    }
  });
}

export async function getUnsyncedMealDefinitions(): Promise<MealDefinition[]> {
  const db = await getDatabase();
  return db.getAllAsync<MealDefinition>('SELECT * FROM meal_definitions WHERE synced_at IS NULL');
}

export async function markMealDefinitionsSynced(ids: MealId[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDatabase();
  const now = new Date().toISOString();
  const placeholders = ids.map(() => '?').join(', ');
  await db.runAsync(
    `UPDATE meal_definitions SET synced_at = ? WHERE id IN (${placeholders})`,
    [now, ...ids]
  );
}

export async function getUnsyncedMealNames(): Promise<MealNameEntry[]> {
  const db = await getDatabase();
  return db.getAllAsync<MealNameEntry>('SELECT * FROM meal_names WHERE synced_at IS NULL');
}

export async function markMealNamesSynced(
  entries: Pick<MealNameEntry, 'meal_id' | 'effective_from'>[]
): Promise<void> {
  if (entries.length === 0) return;
  const db = await getDatabase();
  const now = new Date().toISOString();
  for (const e of entries) {
    await db.runAsync(
      'UPDATE meal_names SET synced_at = ? WHERE meal_id = ? AND effective_from = ?',
      [now, e.meal_id, e.effective_from]
    );
  }
}

/**
 * Makes the account's meals the local meals. Remote rows are upserted as synced. A local meal
 * that the account lacks is removed only if it was already synced (so it was deleted elsewhere)
 * and has no logs; never-synced local meals are kept and will sync up later. No-op when the
 * account has no meals.
 */
export async function replaceMealsFromRemote(
  defs: RemoteMealDefinition[],
  names: RemoteMealName[]
): Promise<void> {
  if (defs.length === 0) return;
  const db = await getDatabase();
  const now = new Date().toISOString();
  const remoteIds = new Set(defs.map((d) => d.id));
  const remoteNameKeys = new Set(names.map((n) => `${n.meal_id}\u0000${n.effective_from}`));

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const d of defs) {
      await txn.runAsync(
        `INSERT INTO meal_definitions
           (id, position, calorie_target, protein_target, carb_target, fat_target, reminder_time, created_at, updated_at, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           position = excluded.position,
           calorie_target = excluded.calorie_target,
           protein_target = excluded.protein_target,
           carb_target = excluded.carb_target,
           fat_target = excluded.fat_target,
           reminder_time = excluded.reminder_time,
           updated_at = excluded.updated_at,
           synced_at = excluded.synced_at`,
        [
          d.id,
          d.position,
          d.calorie_target,
          d.protein_target,
          d.carb_target,
          d.fat_target,
          d.reminder_time,
          toIso(d.created_at, now),
          toIso(d.updated_at, now),
          now,
        ]
      );
    }
    for (const n of names) {
      await txn.runAsync(
        `INSERT INTO meal_names (meal_id, name, effective_from, updated_at, synced_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(meal_id, effective_from) DO UPDATE SET
           name = excluded.name,
           updated_at = excluded.updated_at,
           synced_at = excluded.synced_at`,
        [n.meal_id, n.name, n.effective_from, toIso(n.updated_at, now), now]
      );
    }

    const localDefs = await txn.getAllAsync<{ id: string; synced_at: string | null }>(
      'SELECT id, synced_at FROM meal_definitions'
    );
    for (const l of localDefs) {
      if (remoteIds.has(l.id) || l.synced_at === null) continue;
      const logs = await txn.getFirstAsync<{ c: number }>(
        'SELECT COUNT(*) as c FROM food_logs WHERE meal_slot = ? AND deleted_at IS NULL',
        [l.id]
      );
      if ((logs?.c ?? 0) > 0) continue;
      await txn.runAsync('DELETE FROM meal_slot_confirmations WHERE meal_slot = ?', [l.id]);
      await txn.runAsync('DELETE FROM meal_names WHERE meal_id = ?', [l.id]);
      await txn.runAsync('DELETE FROM meal_definitions WHERE id = ?', [l.id]);
    }

    const localNames = await txn.getAllAsync<{
      meal_id: string;
      effective_from: string;
      synced_at: string | null;
    }>('SELECT meal_id, effective_from, synced_at FROM meal_names');
    for (const l of localNames) {
      if (l.synced_at === null || !remoteIds.has(l.meal_id)) continue;
      if (remoteNameKeys.has(`${l.meal_id}\u0000${l.effective_from}`)) continue;
      await txn.runAsync('DELETE FROM meal_names WHERE meal_id = ? AND effective_from = ?', [
        l.meal_id,
        l.effective_from,
      ]);
    }
  });
}

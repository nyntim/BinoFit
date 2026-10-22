import { NUTRIENT_IDS, normalizeNutrients } from '@/lib/nutrients';
import * as Crypto from 'expo-crypto';
import { format } from 'date-fns';
import type { Food, FoodLog, FoodLogWithFood, MealSlot, RemoteFoodLog } from '@/lib/types';
import { decideRemoteApply, tombstoneSql } from '@/lib/tombstones';
import { fireAppleHealthSync, getDatabase } from '@/lib/database-connection';

export async function addFoodLog(
  entry: Omit<FoodLog, 'id' | 'created_at' | 'updated_at' | 'synced_at'>
): Promise<FoodLog> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const id = Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO food_logs (id, date, meal_slot, food_id, serving_amount, serving_unit, logged_time, created_at, updated_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [id, entry.date, entry.meal_slot, entry.food_id, entry.serving_amount, entry.serving_unit, entry.logged_time ?? null, now, now]
  );
  fireAppleHealthSync();
  return { ...entry, id, created_at: now, updated_at: now, synced_at: null };
}

/**
 * Inserts several logs plus the slot status row in one transaction (multi-select confirm).
 * Rows match addFoodLog rows (synced_at NULL). Every food must exist locally, otherwise the whole
 * batch rolls back: SQLite FKs are not enforced and an unresolved food would join to nothing.
 */
export async function addFoodLogsBatch(input: {
  date: string;
  meal_slot: MealSlot;
  logged_time?: string | null;
  items: readonly { food_id: string; serving_amount: number; serving_unit: string }[];
  defaultEaten: boolean;
}): Promise<FoodLog[]> {
  if (input.items.length === 0) throw new Error('No foods to add');
  const db = await getDatabase();
  const now = new Date().toISOString();
  const logs: FoodLog[] = [];
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const item of input.items) {
      const food = await txn.getFirstAsync<{ id: string }>('SELECT id FROM foods WHERE id = ?', [item.food_id]);
      if (!food) throw new Error('Missing food');
      const id = Crypto.randomUUID();
      await txn.runAsync(
        `INSERT INTO food_logs (id, date, meal_slot, food_id, serving_amount, serving_unit, logged_time, created_at, updated_at, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [id, input.date, input.meal_slot, item.food_id, item.serving_amount, item.serving_unit, input.logged_time ?? null, now, now]
      );
      logs.push({
        id,
        date: input.date,
        meal_slot: input.meal_slot,
        food_id: item.food_id,
        serving_amount: item.serving_amount,
        serving_unit: item.serving_unit,
        logged_time: input.logged_time ?? null,
        created_at: now,
        updated_at: now,
        synced_at: null,
      } as FoodLog);
    }
    await txn.runAsync(
      `INSERT INTO meal_slot_confirmations (id, date, meal_slot, confirmed, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(date, meal_slot) DO NOTHING`,
      [Crypto.randomUUID(), input.date, input.meal_slot, input.defaultEaten ? 1 : 0, now]
    );
  });
  fireAppleHealthSync();
  return logs;
}

export async function getFoodLogsByDate(date: string): Promise<FoodLog[]> {
  const db = await getDatabase();
  return db.getAllAsync<FoodLog>('SELECT * FROM food_logs WHERE date = ? AND deleted_at IS NULL ORDER BY created_at', [date]);
}

/** Tombstones the log; the next sync pushes deleted_at and then purges the row. */
export async function deleteFoodLog(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(`${tombstoneSql('food_logs')} WHERE id = ? AND deleted_at IS NULL`, [now, now, id]);
  fireAppleHealthSync();
}

export async function getUnsyncedFoodLogs(): Promise<FoodLog[]> {
  const db = await getDatabase();
  return db.getAllAsync<FoodLog>('SELECT * FROM food_logs WHERE synced_at IS NULL');
}

export async function updateFoodLog(
  id: string,
  serving_amount: number,
  serving_unit: string,
  logged_time?: string | null
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE food_logs SET serving_amount = ?, serving_unit = ?, logged_time = ?, updated_at = ?, synced_at = NULL WHERE id = ? AND deleted_at IS NULL',
    [serving_amount, serving_unit, logged_time ?? null, now, id]
  );
  fireAppleHealthSync();
}

const FOOD_LOG_WITH_FOOD_SELECT = `SELECT fl.*,
       f.name as food_name, f.brand as food_brand,
       f.calories as food_calories, f.protein as food_protein,
       f.carbs as food_carbs, f.fat as food_fat,
       f.serving_units as food_serving_units,
       ${NUTRIENT_IDS.map((id) => `f.${id} as food_nutrient_${id}`).join(', ')}
     FROM food_logs fl
     JOIN foods f ON fl.food_id = f.id`;

function hydrateFoodNutrients(row: FoodLogWithFood): FoodLogWithFood {
  const raw = row as FoodLogWithFood & Record<string, unknown>;
  const nutrients = normalizeNutrients(Object.fromEntries(NUTRIENT_IDS.map((id) => [id, raw[`food_nutrient_${id}`]])));
  for (const id of NUTRIENT_IDS) delete raw[`food_nutrient_${id}`];
  return { ...row, food_nutrients: nutrients };
}

export async function getFoodLogsWithFoodByDate(date: string): Promise<FoodLogWithFood[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<FoodLogWithFood>(
    `${FOOD_LOG_WITH_FOOD_SELECT}
     WHERE fl.date = ? AND fl.deleted_at IS NULL
     ORDER BY fl.created_at`,
    [date]
  );
  return rows.map(hydrateFoodNutrients);
}

export async function getRecentFoods(limit = 10): Promise<Food[]> {
  const db = await getDatabase();
  return db.getAllAsync<Food>(
    `SELECT DISTINCT f.* FROM foods f
     INNER JOIN (
       SELECT food_id, MAX(created_at) as last_logged FROM food_logs WHERE deleted_at IS NULL GROUP BY food_id
     ) latest ON f.id = latest.food_id
     ORDER BY latest.last_logged DESC
     LIMIT ?`,
    [limit]
  );
}

export async function getFrequentFoods(limit = 10): Promise<Food[]> {
  const db = await getDatabase();
  return db.getAllAsync<Food>(
    `SELECT f.*, COUNT(fl.id) as log_count FROM foods f
     INNER JOIN food_logs fl ON f.id = fl.food_id AND fl.deleted_at IS NULL
     GROUP BY f.id
     ORDER BY log_count DESC
     LIMIT ?`,
    [limit]
  );
}

export async function getLoggedDates(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ date: string }>(
    `SELECT DISTINCT date FROM food_logs WHERE deleted_at IS NULL ORDER BY date DESC LIMIT 365`
  );
  return rows.map((r) => r.date);
}

export async function getLoggedDatesInRange(startDate: string, endDate: string): Promise<string[]> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ date: string }>(
      `SELECT DISTINCT date FROM food_logs WHERE deleted_at IS NULL AND date >= ? AND date <= ? ORDER BY date`,
      [startDate, endDate]
    );
    return rows.map((r) => r.date);
  } catch {
    return [];
  }
}

/** Distinct log dates up to `today` (local yyyy-MM-dd), newest first. */
export async function getAllLoggedDates(
  today: string = format(new Date(), 'yyyy-MM-dd')
): Promise<string[]> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ date: string }>(
      `SELECT DISTINCT date FROM food_logs WHERE deleted_at IS NULL AND date <= ? ORDER BY date DESC`,
      [today]
    );
    return rows.map((r) => r.date);
  } catch {
    return [];
  }
}

/** Logs with food between two yyyy-MM-dd dates, inclusive. A null bound is open. */
export async function getFoodLogsWithFoodInRange(
  start: string | null,
  end: string | null
): Promise<FoodLogWithFood[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<FoodLogWithFood>(
    `${FOOD_LOG_WITH_FOOD_SELECT}
     WHERE (? IS NULL OR fl.date >= ?) AND (? IS NULL OR fl.date <= ?)
       AND fl.deleted_at IS NULL
     ORDER BY fl.date, fl.created_at`,
    [start, start, end, end]
  );
  return rows.map(hydrateFoodNutrients);
}

/** Supabase timestamptz strings carry offsets and microseconds; local rows use plain ISO. */
export function toIso(value: string | null | undefined, fallback: string): string {
  const t = value ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : fallback;
}

/** True when the remote copy should replace the local one (last write wins; ties keep local). */
export function isRemoteNewer(remoteUpdatedAt: string, localUpdatedAt: string): boolean {
  const r = Date.parse(remoteUpdatedAt);
  const l = Date.parse(localUpdatedAt);
  if (!Number.isFinite(l)) return true;
  return Number.isFinite(r) && r > l;
}

/**
 * Merges account food logs into SQLite, last write wins on updated_at. Applied rows are marked
 * synced. Returns how many rows were inserted or updated (removals are not counted).
 */
export async function applyRemoteFoodLogs(rows: RemoteFoodLog[]): Promise<number> {
  if (rows.length === 0) return 0;
  const db = await getDatabase();
  const now = new Date().toISOString();
  let applied = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const r of rows) {
      const updatedAt = toIso(r.updated_at, now);
      const existing = await txn.getFirstAsync<{ updated_at: string }>(
        'SELECT updated_at FROM food_logs WHERE id = ?',
        [r.id]
      );
      const decision = decideRemoteApply({ updated_at: updatedAt, deleted_at: r.deleted_at }, existing);
      if (decision === 'skip') continue;
      if (decision === 'delete') {
        // Removals are not counted: the count reports restored entries.
        await txn.runAsync('DELETE FROM food_logs WHERE id = ?', [r.id]);
        continue;
      }
      await txn.runAsync(
        `INSERT INTO food_logs
           (id, date, meal_slot, food_id, serving_amount, serving_unit, created_at, updated_at, deleted_at, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
         ON CONFLICT(id) DO UPDATE SET
           date = excluded.date,
           meal_slot = excluded.meal_slot,
           food_id = excluded.food_id,
           serving_amount = excluded.serving_amount,
           serving_unit = excluded.serving_unit,
           updated_at = excluded.updated_at,
           deleted_at = NULL,
           synced_at = excluded.synced_at`,
        [
          r.id,
          r.date,
          r.meal_slot,
          r.food_id,
          r.serving_amount,
          r.serving_unit,
          toIso(r.created_at, updatedAt),
          updatedAt,
          now,
        ]
      );
      applied++;
    }
  });
  return applied;
}

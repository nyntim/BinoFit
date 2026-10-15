import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import type {
  Food,
  FoodLog,
  FoodLogWithFood,
  MealDefinition,
  MealId,
  MealNameEntry,
  MealSlot,
  MealSlotConfirmation,
  WaterLog,
} from '@/lib/types';
import { ALWAYS_EFFECTIVE, DEFAULT_MEALS, nameForDate, type MealDraft } from '@/lib/meals';

let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  // Cache the init promise so concurrent first callers all wait for the schema.
  _dbPromise ??= (async () => {
    const db = await SQLite.openDatabaseAsync('fitness.db');
    await initSchema(db);
    return db;
  })().catch((e) => {
    _dbPromise = null;
    throw e;
  });
  return _dbPromise;
}

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS foods (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT,
      serving_units TEXT NOT NULL,
      calories REAL NOT NULL,
      protein REAL NOT NULL,
      carbs REAL NOT NULL,
      fat REAL NOT NULL,
      source TEXT,
      updated_at TEXT NOT NULL,
      fiber REAL,
      sugar REAL,
      sodium REAL,
      cholesterol REAL,
      saturated_fat REAL,
      trans_fat REAL,
      vitamin_d REAL,
      calcium REAL,
      iron REAL,
      potassium REAL
    );

    CREATE TABLE IF NOT EXISTS food_logs (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      meal_slot TEXT NOT NULL,
      food_id TEXT NOT NULL,
      serving_amount REAL NOT NULL,
      serving_unit TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (food_id) REFERENCES foods(id)
    );

    CREATE TABLE IF NOT EXISTS meal_slot_confirmations (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      meal_slot TEXT NOT NULL,
      confirmed INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE(date, meal_slot)
    );

    CREATE TABLE IF NOT EXISTS water_logs (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      drink_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meal_definitions (
      id TEXT PRIMARY KEY,
      position INTEGER NOT NULL,
      calorie_target REAL,
      protein_target REAL,
      carb_target REAL,
      fat_target REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS meal_names (
      meal_id TEXT NOT NULL,
      name TEXT NOT NULL,
      effective_from TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT,
      PRIMARY KEY (meal_id, effective_from)
    );

    CREATE INDEX IF NOT EXISTS idx_food_logs_date ON food_logs(date);
    CREATE INDEX IF NOT EXISTS idx_foods_name ON foods(name);
    CREATE INDEX IF NOT EXISTS idx_meal_slot_confirmations_date ON meal_slot_confirmations(date);
    CREATE INDEX IF NOT EXISTS idx_water_logs_date ON water_logs(date);
  `);

  // Migrations for existing databases
  await db.execAsync(`ALTER TABLE food_logs ADD COLUMN synced_at TEXT;`).catch(() => {});
  await db.execAsync(`ALTER TABLE food_logs ADD COLUMN logged_time TEXT;`).catch(() => {});
  await db.execAsync(`ALTER TABLE foods ADD COLUMN fiber REAL;`).catch(() => {});
  await db.execAsync(`ALTER TABLE foods ADD COLUMN sugar REAL;`).catch(() => {});
  await db.execAsync(`ALTER TABLE foods ADD COLUMN sodium REAL;`).catch(() => {});
  await db.execAsync(`ALTER TABLE foods ADD COLUMN cholesterol REAL;`).catch(() => {});
  await db.execAsync(`ALTER TABLE foods ADD COLUMN saturated_fat REAL;`).catch(() => {});
  await db.execAsync(`ALTER TABLE foods ADD COLUMN trans_fat REAL;`).catch(() => {});
  await db.execAsync(`ALTER TABLE foods ADD COLUMN vitamin_d REAL;`).catch(() => {});
  await db.execAsync(`ALTER TABLE foods ADD COLUMN calcium REAL;`).catch(() => {});
  await db.execAsync(`ALTER TABLE foods ADD COLUMN iron REAL;`).catch(() => {});
  await db.execAsync(`ALTER TABLE foods ADD COLUMN potassium REAL;`).catch(() => {});

  await seedDefaultMeals(db);
}

/**
 * Seeds the four default meals exactly once, when meal_definitions is empty. Names are
 * effective from the beginning of time so all existing history resolves. Never reseeds:
 * the table can never be empty again because at least one meal is always kept.
 */
async function seedDefaultMeals(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM meal_definitions');
  if (row && row.c > 0) return;
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < DEFAULT_MEALS.length; i++) {
      const m = DEFAULT_MEALS[i];
      await db.runAsync(
        `INSERT OR IGNORE INTO meal_definitions (id, position, created_at, updated_at, synced_at)
         VALUES (?, ?, ?, ?, NULL)`,
        [m.id, i, now, now]
      );
      await db.runAsync(
        `INSERT OR IGNORE INTO meal_names (meal_id, name, effective_from, updated_at, synced_at)
         VALUES (?, ?, ?, ?, NULL)`,
        [m.id, m.name, ALWAYS_EFFECTIVE, now]
      );
    }
  });
}

export async function searchFoods(query: string, limit = 50): Promise<Food[]> {
  const db = await getDatabase();
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  // Each word must appear in name or brand (AND between words, OR within each word across fields)
  const wordConditions = words.map(() => `(name LIKE ? OR brand LIKE ?)`).join(' AND ');
  const wordParams = words.flatMap((w) => [`%${w}%`, `%${w}%`]);

  return db.getAllAsync<Food>(
    `SELECT *, 
       CASE
         WHEN lower(name) = lower(?)           THEN 1
         WHEN lower(name) LIKE lower(? || '%') THEN 2
         ELSE                                       3
       END as matchTier
     FROM foods
     WHERE ${wordConditions}
     ORDER BY matchTier ASC, length(name) ASC
     LIMIT ?`,
    [...wordParams, query, query, limit]
  );
}

export async function searchFoodsByTokens(tokens: string[], limit = 50): Promise<Food[]> {
  if (tokens.length === 0) return [];
  const db = await getDatabase();
  const wordConditions = tokens.map(() => `(name LIKE ? OR brand LIKE ?)`).join(' AND ');
  const wordParams = tokens.flatMap((w) => [`%${w}%`, `%${w}%`]);

  return db.getAllAsync<Food>(
    `SELECT *, 3 as matchTier FROM foods
     WHERE ${wordConditions}
     ORDER BY length(name) ASC
     LIMIT ?`,
    [...wordParams, limit]
  );
}

export async function searchFoodsBySingleToken(token: string, limit = 50): Promise<Food[]> {
  const db = await getDatabase();
  return db.getAllAsync<Food>(
    `SELECT *, 4 as matchTier FROM foods
     WHERE name LIKE ? OR brand LIKE ?
     ORDER BY length(name) ASC
     LIMIT ?`,
    [`%${token}%`, `%${token}%`, limit]
  );
}

export async function searchLiquids(query: string): Promise<Food[]> {
  const db = await getDatabase();
  return db.getAllAsync<Food>(
    `SELECT * FROM foods 
     WHERE (name LIKE ? OR brand LIKE ?)
     AND (serving_units LIKE '%ml%' 
          OR serving_units LIKE '%fl oz%' 
          OR serving_units LIKE '%cup%' 
          OR serving_units LIKE '%oz%' 
          OR name LIKE '%Water%'
          OR name LIKE '%Coffee%'
          OR name LIKE '%Milk%'
          OR name LIKE '%Soda%'
          OR name LIKE '%Drink%'
          OR name LIKE '%Juice%')
     ORDER BY
       CASE
         WHEN lower(name) = lower(?)           THEN 0
         WHEN lower(name) LIKE lower(? || '%') THEN 1
         ELSE                                       2
       END ASC,
       length(name) ASC
     LIMIT 50`,
    [`%${query}%`, `%${query}%`, query, query]
  );
}

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
  return { ...entry, id, created_at: now, updated_at: now, synced_at: null };
}

export async function getFoodLogsByDate(date: string): Promise<FoodLog[]> {
  const db = await getDatabase();
  return db.getAllAsync<FoodLog>('SELECT * FROM food_logs WHERE date = ? ORDER BY created_at', [date]);
}

export async function deleteFoodLog(id: string): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ synced_at: string | null }>(
    'SELECT synced_at FROM food_logs WHERE id = ?',
    [id]
  );
  await db.runAsync('DELETE FROM food_logs WHERE id = ?', [id]);
  if (row?.synced_at) {
    // Row was previously synced — remove from Supabase too (fire-and-forget)
    import('@/lib/supabase').then(({ supabase }) => {
      supabase.from('food_logs').delete().eq('id', id).then(() => {});
    });
  }
}

export async function getUnsyncedFoodLogs(): Promise<FoodLog[]> {
  const db = await getDatabase();
  return db.getAllAsync<FoodLog>('SELECT * FROM food_logs WHERE synced_at IS NULL');
}

export async function markFoodLogsSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDatabase();
  const now = new Date().toISOString();
  const placeholders = ids.map(() => '?').join(', ');
  await db.runAsync(
    `UPDATE food_logs SET synced_at = ? WHERE id IN (${placeholders})`,
    [now, ...ids]
  );
}

const MICRO_COLUMNS = [
  'fiber', 'sugar', 'sodium', 'cholesterol', 'saturated_fat',
  'trans_fat', 'vitamin_d', 'calcium', 'iron', 'potassium',
] as const;

export function hasAnyMicros(food: Food): boolean {
  return MICRO_COLUMNS.some((col) => food[col] != null);
}

/**
 * Insert or update a remote food in the local cache. Micronutrients are merged:
 * a partial row (e.g. from a search result) never overwrites known values with null.
 */
export async function cacheRemoteFood(
  food: Food,
  options: { partial?: boolean } = {}
): Promise<void> {
  const db = await getDatabase();
  const microUpdates = MICRO_COLUMNS.map((c) => `${c} = COALESCE(excluded.${c}, foods.${c})`).join(', ');
  // Partial rows (search results) never touch an existing row
  const insertVerb = options.partial ? 'INSERT OR IGNORE' : 'INSERT';
  const onConflict = options.partial
    ? ''
    : `ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       brand = excluded.brand,
       serving_units = excluded.serving_units,
       calories = excluded.calories,
       protein = excluded.protein,
       carbs = excluded.carbs,
       fat = excluded.fat,
       source = excluded.source,
       updated_at = excluded.updated_at,
       ${microUpdates}
     WHERE foods.source IS NOT 'custom'`;
  await db.runAsync(
    `${insertVerb} INTO foods
      (id, name, brand, serving_units, calories, protein, carbs, fat, source, updated_at,
       ${MICRO_COLUMNS.join(', ')})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${MICRO_COLUMNS.map(() => '?').join(', ')})
     ${onConflict}`,
    [
      food.id,
      food.name,
      food.brand ?? null,
      food.serving_units,
      food.calories,
      food.protein,
      food.carbs,
      food.fat,
      food.source ?? null,
      food.updated_at,
      ...MICRO_COLUMNS.map((c) => food[c] ?? null),
    ]
  );
}

export async function getFoodById(id: string): Promise<Food | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Food>('SELECT * FROM foods WHERE id = ?', [id]);
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
    'UPDATE food_logs SET serving_amount = ?, serving_unit = ?, logged_time = ?, updated_at = ?, synced_at = NULL WHERE id = ?',
    [serving_amount, serving_unit, logged_time ?? null, now, id]
  );
}

export async function getFoodLogsWithFoodByDate(date: string): Promise<FoodLogWithFood[]> {
  const db = await getDatabase();
  return db.getAllAsync<FoodLogWithFood>(
    `SELECT fl.*,
       f.name as food_name, f.brand as food_brand,
       f.calories as food_calories, f.protein as food_protein,
       f.carbs as food_carbs, f.fat as food_fat,
       f.serving_units as food_serving_units
     FROM food_logs fl
     JOIN foods f ON fl.food_id = f.id
     WHERE fl.date = ?
     ORDER BY fl.created_at`,
    [date]
  );
}

export async function getRecentFoods(limit = 10): Promise<Food[]> {
  const db = await getDatabase();
  return db.getAllAsync<Food>(
    `SELECT DISTINCT f.* FROM foods f
     INNER JOIN (
       SELECT food_id, MAX(created_at) as last_logged FROM food_logs GROUP BY food_id
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
     INNER JOIN food_logs fl ON f.id = fl.food_id
     GROUP BY f.id
     ORDER BY log_count DESC
     LIMIT ?`,
    [limit]
  );
}

export async function getLoggedDates(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ date: string }>(
    `SELECT DISTINCT date FROM food_logs ORDER BY date DESC LIMIT 365`
  );
  return rows.map((r) => r.date);
}

export async function getLoggedDatesInRange(startDate: string, endDate: string): Promise<string[]> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ date: string }>(
      `SELECT DISTINCT date FROM food_logs WHERE date >= ? AND date <= ? ORDER BY date`,
      [startDate, endDate]
    );
    return rows.map((r) => r.date);
  } catch {
    return [];
  }
}

export async function getAllLoggedDates(): Promise<string[]> {
  try {
    const db = await getDatabase();
    const today = new Date().toISOString().split('T')[0];
    const rows = await db.getAllAsync<{ date: string }>(
      `SELECT DISTINCT date FROM food_logs WHERE date <= ? ORDER BY date DESC`,
      [today]
    );
    return rows.map((r) => r.date);
  } catch {
    return [];
  }
}

export async function addCustomFood(
  food: Omit<Food, 'id' | 'updated_at'>
): Promise<Food> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const id = Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO foods (id, name, brand, serving_units, calories, protein, carbs, fat, source, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, food.name, food.brand ?? null, food.serving_units, food.calories, food.protein, food.carbs, food.fat, 'custom', now]
  );
  return { ...food, id, updated_at: now };
}

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
}

export async function addWaterLog(
  entry: Omit<WaterLog, 'id' | 'created_at'>
): Promise<WaterLog> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const id = Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO water_logs (id, date, amount, drink_name, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, entry.date, entry.amount, entry.drink_name, now]
  );
  return { ...entry, id, created_at: now };
}

export async function getWaterLogsByDate(date: string): Promise<WaterLog[]> {
  const db = await getDatabase();
  return db.getAllAsync<WaterLog>(
    'SELECT * FROM water_logs WHERE date = ? ORDER BY created_at',
    [date]
  );
}

export async function deleteWaterLog(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM water_logs WHERE id = ?', [id]);
}

// ── User-defined meals ──────────────────────────────────────────

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
    'SELECT COUNT(*) as c FROM food_logs WHERE meal_slot = ?',
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
 * (same as other tables). Synced food logs of a deleted meal are removed best-effort.
 */
export async function saveMealDraft(draft: MealDraft, today: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const syncedLogIds: string[] = [];

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const id of draft.deletedIds) {
      const synced = await txn.getAllAsync<{ id: string }>(
        'SELECT id FROM food_logs WHERE meal_slot = ? AND synced_at IS NOT NULL',
        [id]
      );
      syncedLogIds.push(...synced.map((r) => r.id));
      await txn.runAsync('DELETE FROM food_logs WHERE meal_slot = ?', [id]);
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
           (id, position, calorie_target, protein_target, carb_target, fat_target, created_at, updated_at, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           position = excluded.position,
           calorie_target = excluded.calorie_target,
           protein_target = excluded.protein_target,
           carb_target = excluded.carb_target,
           fat_target = excluded.fat_target,
           updated_at = excluded.updated_at,
           synced_at = NULL
         WHERE meal_definitions.position IS NOT excluded.position
            OR meal_definitions.calorie_target IS NOT excluded.calorie_target
            OR meal_definitions.protein_target IS NOT excluded.protein_target
            OR meal_definitions.carb_target IS NOT excluded.carb_target
            OR meal_definitions.fat_target IS NOT excluded.fat_target`,
        [m.id, i, m.calorie_target, m.protein_target, m.carb_target, m.fat_target, now, now]
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

  if (syncedLogIds.length > 0) {
    import('@/lib/supabase')
      .then(({ supabase }) => supabase.from('food_logs').delete().in('id', syncedLogIds))
      .catch(() => {});
  }
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

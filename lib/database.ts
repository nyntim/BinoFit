import { NUTRIENT_IDS, normalizeNutrients } from '@/lib/nutrients';
import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { format } from 'date-fns';
import type {
  Food,
  FoodLog,
  FoodLogWithFood,
  MealDefinition,
  MealId,
  MealNameEntry,
  MealSlot,
  MealSlotConfirmation,
  RemoteFoodLog,
  RemoteMealDefinition,
  RemoteMealName,
  WaterLog,
} from '@/lib/types';
import { decideRemoteApply, tombstoneSql } from '@/lib/tombstones';
import { initWeightSchema } from '@/lib/weight';
import { initWorkoutSchema } from '@/lib/workouts/schema';
import { ALWAYS_EFFECTIVE, DEFAULT_MEALS, nameForDate, type MealDraft } from '@/lib/meals';

function fireAppleHealthSync(): void {
  void import('@/lib/health-schedule').then((m) => m.scheduleAppleHealthSync());
}

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
      ${NUTRIENT_IDS.map((id) => `${id} REAL`).join(',\n      ')},
      synced_at TEXT
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
      reminder_time TEXT,
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
  await db.execAsync(`ALTER TABLE food_logs ADD COLUMN deleted_at TEXT;`).catch(() => {});
  await db.execAsync(`ALTER TABLE meal_definitions ADD COLUMN reminder_time TEXT;`).catch(() => {});
  const foodColumns = new Set((await db.getAllAsync<{ name: string }>('PRAGMA table_info(foods)')).map((c) => c.name));
  for (const column of [...NUTRIENT_IDS, 'synced_at', 'barcode']) {
    if (!foodColumns.has(column)) await db.execAsync(`ALTER TABLE foods ADD COLUMN ${column} ${NUTRIENT_IDS.includes(column as typeof NUTRIENT_IDS[number]) ? 'REAL' : 'TEXT'}`);
  }
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_foods_barcode ON foods(barcode)');
  await initWeightSchema(db);

  await seedDefaultMeals(db);
  await initWorkoutSchema(db);
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

const MICRO_COLUMNS = NUTRIENT_IDS;

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
  const microUpdates = MICRO_COLUMNS.map((c) => `${c} = CASE WHEN excluded.serving_units = foods.serving_units THEN COALESCE(excluded.${c}, foods.${c}) ELSE excluded.${c} END`).join(', ');
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
       barcode = COALESCE(excluded.barcode, foods.barcode),
       ${microUpdates}
     WHERE foods.source IS NOT 'custom'`;
  await db.runAsync(
    `${insertVerb} INTO foods
      (id, name, brand, serving_units, calories, protein, carbs, fat, source, updated_at, barcode,
       ${MICRO_COLUMNS.join(', ')})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${MICRO_COLUMNS.map(() => '?').join(', ')})
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
      food.barcode ?? null,
      ...MICRO_COLUMNS.map((c) => normalizeNutrients(food)[c]),
    ]
  );
}

/** Local food for a normalized barcode: the user's own custom food first, then the most recently updated row. */
export async function getFoodByBarcode(code: string): Promise<Food | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Food>(
    `SELECT * FROM foods WHERE barcode = ?
     ORDER BY (source = 'custom') DESC, updated_at DESC LIMIT 1`,
    [code]
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

type CustomFoodInput = Omit<Food, 'id' | 'updated_at'>;
const FOOD_CORE_COLUMNS = ['name', 'brand', 'serving_units', 'calories', 'protein', 'carbs', 'fat'] as const;
function customValues(food: CustomFoodInput) {
  const nutrients = normalizeNutrients(food);
  return [...FOOD_CORE_COLUMNS.map((key) => food[key] ?? null), ...NUTRIENT_IDS.map((id) => nutrients[id])];
}

export async function addCustomFood(food: CustomFoodInput): Promise<Food> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const id = Crypto.randomUUID();
  const columns = [...FOOD_CORE_COLUMNS, ...NUTRIENT_IDS];
  await db.runAsync(
    `INSERT INTO foods (id, ${columns.join(', ')}, source, updated_at, barcode, synced_at)
     VALUES (?, ${columns.map(() => '?').join(', ')}, 'custom', ?, ?, NULL)`,
    [id, ...customValues(food), now, food.barcode ?? null]
  );
  return { ...food, ...normalizeNutrients(food), id, source: 'custom', updated_at: now, synced_at: null };
}

export async function updateCustomFood(id: string, food: CustomFoodInput): Promise<Food> {
  const db = await getDatabase();
  const existing = await getFoodById(id);
  if (!existing || existing.source !== 'custom') throw new Error('Custom food unavailable');
  // Ensure a write during upload has a distinct snapshot timestamp, even in the same millisecond.
  const now = new Date(Math.max(Date.now(), Date.parse(existing.updated_at) + 1 || 0)).toISOString();
  const columns = [...FOOD_CORE_COLUMNS, ...NUTRIENT_IDS];
  await db.runAsync(
    `UPDATE foods SET ${columns.map((c) => `${c} = ?`).join(', ')}, updated_at = ?, synced_at = NULL WHERE id = ? AND source = 'custom'`,
    [...customValues(food), now, id]
  );
  return { ...food, ...normalizeNutrients(food), id, source: 'custom', updated_at: now, synced_at: null };
}

export async function getUnsyncedCustomFoods(): Promise<Food[]> {
  const db = await getDatabase();
  return db.getAllAsync<Food>("SELECT * FROM foods WHERE source = 'custom' AND synced_at IS NULL");
}
export async function markCustomFoodsSynced(rows: readonly Pick<Food, 'id' | 'updated_at'>[]): Promise<void> {
  const db = await getDatabase();
  for (const row of rows) await db.runAsync("UPDATE foods SET synced_at = ? WHERE id = ? AND updated_at = ? AND source = 'custom'", [new Date().toISOString(), row.id, row.updated_at]);
}

/** Authoritative definitions; remote nulls clear values, local pending edits stay pending. */
export async function applyRemoteCustomFoods(rows: readonly Food[]): Promise<number> {
  const db = await getDatabase();
  let applied = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const food of rows) {
      if (food.source !== 'custom') continue;
      const local = await txn.getFirstAsync<Food>('SELECT * FROM foods WHERE id = ?', [food.id]);
      const updated = toIso(food.updated_at, new Date().toISOString());
      if (local && (local.source !== 'custom' || local.synced_at == null || !isRemoteNewer(updated, local.updated_at))) continue;
      const columns = [...FOOD_CORE_COLUMNS, ...NUTRIENT_IDS];
      await txn.runAsync(
        `INSERT INTO foods (id, ${columns.join(', ')}, source, updated_at, synced_at) VALUES (?, ${columns.map(() => '?').join(', ')}, 'custom', ?, ?)
         ON CONFLICT(id) DO UPDATE SET ${columns.map((c) => `${c} = excluded.${c}`).join(', ')}, updated_at = excluded.updated_at, synced_at = excluded.synced_at`,
        [food.id, ...customValues(food), updated, new Date().toISOString()]
      );
      applied++;
    }
  });
  return applied;
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

// ── Export ──────────────────────────────────────────────────────

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

// ── Account restore / sign-out ──────────────────────────────────

/** Supabase timestamptz strings carry offsets and microseconds; local rows use plain ISO. */
function toIso(value: string | null | undefined, fallback: string): string {
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

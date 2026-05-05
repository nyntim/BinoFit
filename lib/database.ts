import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { FOODS_SEED } from '@/assets/data/foods-seed';
import type { Food, FoodLog, FoodLogWithFood, MealSlot, MealSlotConfirmation, WaterLog } from '@/lib/types';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('fitness.db');
  await initSchema(_db);
  return _db;
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
      updated_at TEXT NOT NULL
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

    CREATE INDEX IF NOT EXISTS idx_food_logs_date ON food_logs(date);
    CREATE INDEX IF NOT EXISTS idx_foods_name ON foods(name);
    CREATE INDEX IF NOT EXISTS idx_meal_slot_confirmations_date ON meal_slot_confirmations(date);
    CREATE INDEX IF NOT EXISTS idx_water_logs_date ON water_logs(date);
  `);

  // Migrations for existing databases
  await db.execAsync(`
    ALTER TABLE food_logs ADD COLUMN synced_at TEXT;
  `).catch(() => {
    // Column already exists — safe to ignore
  });

  await seedFoods(db);
}

async function seedFoods(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM foods');
  if (row && row.count > 0) return;

  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const food of FOODS_SEED) {
      await db.runAsync(
        `INSERT OR IGNORE INTO foods
          (id, name, brand, serving_units, calories, protein, carbs, fat, source, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Crypto.randomUUID(),
          food.name,
          food.brand ?? null,
          food.serving_units,
          food.calories,
          food.protein,
          food.carbs,
          food.fat,
          food.source ?? null,
          now,
        ]
      );
    }
  });
}

export async function searchFoods(query: string): Promise<Food[]> {
  const db = await getDatabase();
  return db.getAllAsync<Food>(
    `SELECT * FROM foods WHERE name LIKE ? OR brand LIKE ? ORDER BY name LIMIT 50`,
    [`%${query}%`, `%${query}%`]
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
     ORDER BY name LIMIT 50`,
    [`%${query}%`, `%${query}%`]
  );
}

export async function addFoodLog(
  entry: Omit<FoodLog, 'id' | 'created_at' | 'updated_at' | 'synced_at'>
): Promise<FoodLog> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const id = Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO food_logs (id, date, meal_slot, food_id, serving_amount, serving_unit, created_at, updated_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [id, entry.date, entry.meal_slot, entry.food_id, entry.serving_amount, entry.serving_unit, now, now]
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

export async function cacheRemoteFood(food: Food): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR IGNORE INTO foods
      (id, name, brand, serving_units, calories, protein, carbs, fat, source, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  serving_unit: string
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE food_logs SET serving_amount = ?, serving_unit = ?, updated_at = ?, synced_at = NULL WHERE id = ?',
    [serving_amount, serving_unit, now, id]
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

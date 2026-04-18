import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { FOODS_SEED } from '@/assets/data/foods-seed';
import type { Food, FoodLog, FoodLogWithFood } from '@/lib/types';

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

    CREATE INDEX IF NOT EXISTS idx_food_logs_date ON food_logs(date);
    CREATE INDEX IF NOT EXISTS idx_foods_name ON foods(name);
  `);

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

export async function addFoodLog(
  entry: Omit<FoodLog, 'id' | 'created_at' | 'updated_at'>
): Promise<FoodLog> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const id = Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO food_logs (id, date, meal_slot, food_id, serving_amount, serving_unit, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, entry.date, entry.meal_slot, entry.food_id, entry.serving_amount, entry.serving_unit, now, now]
  );
  return { ...entry, id, created_at: now, updated_at: now };
}

export async function getFoodLogsByDate(date: string): Promise<FoodLog[]> {
  const db = await getDatabase();
  return db.getAllAsync<FoodLog>('SELECT * FROM food_logs WHERE date = ? ORDER BY created_at', [date]);
}

export async function deleteFoodLog(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM food_logs WHERE id = ?', [id]);
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
    'UPDATE food_logs SET serving_amount = ?, serving_unit = ?, updated_at = ? WHERE id = ?',
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

import { NUTRIENT_IDS } from '@/lib/nutrients';
import * as SQLite from 'expo-sqlite';
import { initWeightSchema } from '@/lib/weight';
import { initWorkoutSchema } from '@/lib/workouts/schema';
import { ALWAYS_EFFECTIVE, DEFAULT_MEALS } from '@/lib/meals';

export function fireAppleHealthSync(): void {
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
export async function seedDefaultMeals(db: SQLite.SQLiteDatabase): Promise<void> {
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

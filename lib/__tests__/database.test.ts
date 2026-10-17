import * as SQLite from 'expo-sqlite';
import { createMemoryDb } from '@/test-utils/sqlite-memory';
import type { Food } from '@/lib/types';

let mem: ReturnType<typeof createMemoryDb>;
let database: typeof import('@/lib/database');
let markRowsSynced: typeof import('@/lib/tombstones').markRowsSynced;

beforeEach(() => {
  jest.resetModules();
  mem = createMemoryDb();
  // resetModules yields a fresh expo-sqlite mock; require it after the reset.
  const SQLite = require('expo-sqlite');
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  database = require('@/lib/database');
  markRowsSynced = require('@/lib/tombstones').markRowsSynced;
});

const mk = (over: Record<string, any> = {}): Food =>
  ({
    id: 'f1', name: 'Remote', brand: 'Brand', serving_units: '100g',
    calories: 100, protein: 1, carbs: 2, fat: 3, source: 'branded',
    updated_at: '2024-01-01', ...over,
  }) as Food;

const row = (id = 'f1') => database.getFoodById(id) as Promise<any>;

const insertRaw = (id: string, source: string | null, fiber: number | null = null) =>
  mem.raw
    .prepare(
      `INSERT INTO foods (id,name,serving_units,calories,protein,carbs,fat,source,updated_at,fiber)
       VALUES (?, 'Mine', '1 serving', 50, 1, 1, 1, ?, '2024-01-01', ?)`
    )
    .run(id, source, fiber);

describe('cacheRemoteFood', () => {
  it('inserts a new full row including micronutrients', async () => {
    await database.cacheRemoteFood(mk({ fiber: 4, iron: 1.5 }));
    expect(await row()).toMatchObject({ name: 'Remote', fiber: 4, iron: 1.5, sodium: null });
  });

  it('partial insert never overwrites an existing row', async () => {
    await database.cacheRemoteFood(mk({ fiber: 4 }));
    await database.cacheRemoteFood(mk({ calories: 999, name: 'Changed' }), { partial: true });
    expect(await row()).toMatchObject({ name: 'Remote', calories: 100, fiber: 4 });
  });

  it('partial insert adds the row when absent', async () => {
    await database.cacheRemoteFood(mk(), { partial: true });
    expect(await row()).toMatchObject({ name: 'Remote' });
  });

  it('full upsert updates macros on an existing remote row', async () => {
    await database.cacheRemoteFood(mk({ calories: 100 }));
    await database.cacheRemoteFood(mk({ calories: 250, name: 'Renamed', updated_at: '2025-01-01' }));
    expect(await row()).toMatchObject({ calories: 250, name: 'Renamed', updated_at: '2025-01-01' });
  });

  it('full upsert keeps known micros when the incoming value is null', async () => {
    await database.cacheRemoteFood(mk({ fiber: 4, sugar: 9 }));
    await database.cacheRemoteFood(mk({ fiber: null, sugar: 12 }));
    expect(await row()).toMatchObject({ fiber: 4, sugar: 12 });
  });

  it('full upsert never overwrites a source=custom row', async () => {
    await database.getDatabase();
    insertRaw('f1', 'custom', 7);
    await database.cacheRemoteFood(mk({ calories: 999, fiber: 1 }));
    expect(await row()).toMatchObject({ name: 'Mine', calories: 50, source: 'custom', fiber: 7 });
  });

  it('partial insert never overwrites a source=custom row', async () => {
    await database.getDatabase();
    insertRaw('f1', 'custom');
    await database.cacheRemoteFood(mk({ calories: 999 }), { partial: true });
    expect(await row()).toMatchObject({ name: 'Mine', calories: 50 });
  });

  it('full upsert overwrites rows whose source is NULL', async () => {
    await database.getDatabase();
    insertRaw('f1', null);
    await database.cacheRemoteFood(mk());
    expect(await row()).toMatchObject({ name: 'Remote' });
  });
});

describe('hasAnyMicros', () => {
  it('is false with no micros and true when any is set (including 0)', () => {
    expect(database.hasAnyMicros(mk())).toBe(false);
    expect(database.hasAnyMicros(mk({ iron: 0 }))).toBe(true);
  });
});

describe('schema migration on an existing db', () => {
  it('adds missing columns to a legacy foods/food_logs schema and keeps data', async () => {
    mem.raw.exec(`
      CREATE TABLE foods (id TEXT PRIMARY KEY, name TEXT NOT NULL, brand TEXT, serving_units TEXT NOT NULL,
        calories REAL NOT NULL, protein REAL NOT NULL, carbs REAL NOT NULL, fat REAL NOT NULL, source TEXT, updated_at TEXT NOT NULL);
      CREATE TABLE food_logs (id TEXT PRIMARY KEY, date TEXT NOT NULL, meal_slot TEXT NOT NULL, food_id TEXT NOT NULL,
        serving_amount REAL NOT NULL, serving_unit TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      INSERT INTO foods VALUES ('old','Old','b','1',1,1,1,1,NULL,'2023');
    `);
    await database.getDatabase();
    const cols = mem.raw.prepare('PRAGMA table_info(foods)').all().map((c: any) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['fiber', 'potassium', 'cholesterol']));
    const logCols = mem.raw.prepare('PRAGMA table_info(food_logs)').all().map((c: any) => c.name);
    expect(logCols).toEqual(expect.arrayContaining(['synced_at', 'logged_time']));
    expect(await database.getFoodById('old')).toMatchObject({ name: 'Old', fiber: null });
  });
});

describe('food log basics', () => {
  const entry = (n: number) =>
    ({ date: '2024-05-01', meal_slot: 'lunch', food_id: 'f1', serving_amount: n, serving_unit: 'g' }) as any;

  it('markRowsSynced flags only the given rows', async () => {
    await database.cacheRemoteFood(mk());
    const a = await database.addFoodLog(entry(1));
    const b = await database.addFoodLog(entry(2));
    expect((await database.getUnsyncedFoodLogs()).length).toBe(2);
    await markRowsSynced('food_logs', [{ id: a.id, updated_at: a.updated_at }]);
    expect((await database.getUnsyncedFoodLogs()).map((l) => l.id)).toEqual([b.id]);
  });

  it('updateFoodLog resets synced_at so edits re-sync', async () => {
    await database.cacheRemoteFood(mk());
    const a = await database.addFoodLog(entry(1));
    await markRowsSynced('food_logs', [{ id: a.id, updated_at: a.updated_at }]);
    await database.updateFoodLog(a.id, 3, 'g');
    expect((await database.getUnsyncedFoodLogs()).map((l) => l.id)).toEqual([a.id]);
  });

  it('getAllLoggedDates returns distinct dates newest first and excludes future dates', async () => {
    await database.cacheRemoteFood(mk());
    for (const d of ['2024-05-01', '2024-05-01', '2024-04-30', '2999-01-01']) {
      await database.addFoodLog({ ...entry(1), date: d });
    }
    expect(await database.getAllLoggedDates()).toEqual(['2024-05-01', '2024-04-30']);
  });

  it('getAllLoggedDates uses the passed local today as the upper bound', async () => {
    await database.cacheRemoteFood(mk());
    for (const d of ['2024-05-02', '2024-05-01', '2024-04-30']) {
      await database.addFoodLog({ ...entry(1), date: d });
    }
    expect(await database.getAllLoggedDates('2024-05-01')).toEqual(['2024-05-01', '2024-04-30']);
    expect(await database.getAllLoggedDates('2024-05-02')).toEqual(['2024-05-02', '2024-05-01', '2024-04-30']);
  });
});

describe('ensureMealSlotStatus', () => {
  const stored = (date: string, slot: string) =>
    mem.raw
      .prepare('SELECT confirmed FROM meal_slot_confirmations WHERE date = ? AND meal_slot = ?')
      .all(date, slot) as { confirmed: number }[];

  it('inserts the default and returns it when no row exists (planned)', async () => {
    expect(await database.ensureMealSlotStatus('2024-05-01', 'lunch', false)).toBe(false);
    expect(stored('2024-05-01', 'lunch')).toEqual([{ confirmed: 0 }]);
  });

  it('inserts the default and returns it when no row exists (eaten)', async () => {
    expect(await database.ensureMealSlotStatus('2024-05-01', 'lunch', true)).toBe(true);
    expect(stored('2024-05-01', 'lunch')).toEqual([{ confirmed: 1 }]);
  });

  it('never overwrites an existing planned row and returns the existing value', async () => {
    await database.ensureMealSlotStatus('2024-05-01', 'lunch', false);
    expect(await database.ensureMealSlotStatus('2024-05-01', 'lunch', true)).toBe(false);
    expect(stored('2024-05-01', 'lunch')).toEqual([{ confirmed: 0 }]);
  });

  it('never overwrites an existing eaten row and returns the existing value', async () => {
    await database.ensureMealSlotStatus('2024-05-01', 'lunch', true);
    expect(await database.ensureMealSlotStatus('2024-05-01', 'lunch', false)).toBe(true);
    expect(stored('2024-05-01', 'lunch')).toEqual([{ confirmed: 1 }]);
  });

  it('keeps a status set via upsertMealSlotConfirmation', async () => {
    await database.upsertMealSlotConfirmation('2024-05-01', 'dinner', false);
    expect(await database.ensureMealSlotStatus('2024-05-01', 'dinner', true)).toBe(false);
  });

  it('treats different slots and dates independently', async () => {
    await database.ensureMealSlotStatus('2024-05-01', 'lunch', false);
    expect(await database.ensureMealSlotStatus('2024-05-01', 'dinner', true)).toBe(true);
    expect(await database.ensureMealSlotStatus('2024-05-02', 'lunch', true)).toBe(true);
  });
});

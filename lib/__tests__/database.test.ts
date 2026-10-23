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

describe('complete nutrient persistence and custom definitions', () => {
  it('round trips all catalog fields and explicit clears, guards custom IDs and upload snapshots', async () => {
    const { NUTRIENT_IDS } = require('@/lib/nutrients');
    const nutrients = Object.fromEntries(NUTRIENT_IDS.map((id: string, index: number) => [id, index === 0 ? 0 : index / 100000]));
    const food = await database.addCustomFood({ ...mk(), ...nutrients });
    expect(await database.getFoodById(food.id)).toMatchObject({ ...nutrients, source: 'custom', synced_at: null });
    const edited = await database.updateCustomFood(food.id, { ...food, fiber: null });
    await database.markCustomFoodsSynced([food]);
    expect((await database.getUnsyncedCustomFoods()).map((f) => f.id)).toContain(food.id);
    await database.markCustomFoodsSynced([edited]);
    expect(await database.getUnsyncedCustomFoods()).toHaveLength(0);
    expect(await database.getFoodById(food.id)).toMatchObject({ fiber: null, b12: nutrients.b12 });
    await database.cacheRemoteFood(mk());
    await expect(database.updateCustomFood('f1', mk())).rejects.toThrow('Custom food unavailable');
    await expect(database.updateCustomFood('missing', mk())).rejects.toThrow('Custom food unavailable');
  });
  it('does not merge nutrients across a changed serving basis', async () => {
    await database.cacheRemoteFood(mk({ fiber: 5, b12: .00001 }));
    await database.cacheRemoteFood(mk({ serving_units: '1 serving (30g)', fiber: null }));
    expect(await row()).toMatchObject({ fiber: null, b12: null });
  });
  it('hydrates both joined reads, preserves precision and excludes tombstones', async () => {
    await database.cacheRemoteFood(mk({ fiber: 0, b12: .000001 }));
    const log = await database.addFoodLog({ date: '2026-01-01', meal_slot: 'lunch', food_id: 'f1', serving_amount: .5, serving_unit: '100g' });
    expect((await database.getFoodLogsWithFoodByDate('2026-01-01'))[0].food_nutrients).toMatchObject({ fiber: 0, b12: .000001, added_sugar: null });
    expect((await database.getFoodLogsWithFoodInRange(null, null))[0].food_nutrients).toMatchObject({ fiber: 0, b12: .000001 });
    await database.deleteFoodLog(log.id);
    expect(await database.getFoodLogsWithFoodInRange(null, null)).toHaveLength(0);
  });
  it('upgrades an existing ten-column populated table without changing relationships or values', async () => {
    const { NUTRIENT_IDS } = require('@/lib/nutrients');
    const existing = ['fiber','sugar','sodium','cholesterol','saturated_fat','trans_fat','vitamin_d','calcium','iron','potassium'];
    mem.raw.exec(`CREATE TABLE foods (id TEXT PRIMARY KEY, name TEXT, brand TEXT, serving_units TEXT, calories REAL, protein REAL, carbs REAL, fat REAL, source TEXT, updated_at TEXT, barcode TEXT, ${existing.map((id) => `${id} REAL`).join(',')});
      INSERT INTO foods (id,name,serving_units,calories,protein,carbs,fat,source,updated_at,barcode,fiber) VALUES ('legacy','Mine','100g',1,2,3,4,'custom','2024-01-01','0123',0);`);
    await database.getDatabase();
    expect(await database.getFoodById('legacy')).toMatchObject({ fiber: 0, barcode: '0123', updated_at: '2024-01-01', choline: null, synced_at: null });
    expect(mem.raw.prepare('PRAGMA table_info(foods)').all().map((c: any) => c.name)).toEqual(expect.arrayContaining([...NUTRIENT_IDS, 'synced_at']));
    expect(await database.getUnsyncedCustomFoods()).toHaveLength(1);
  });
});

describe('checked additive migration', () => {
  it('can initialize an upgraded populated database again without changing values', async () => {
    const food = await database.addCustomFood(mk({ fiber: 0, b12: .000001 }));
    await database.addFoodLog({ date: '2026-01-01', meal_slot: 'lunch', food_id: food.id, serving_amount: .5, serving_unit: '100g' });
    jest.resetModules();
    require('expo-sqlite').openDatabaseAsync.mockResolvedValue(mem);
    const reloaded = require('@/lib/database');
    expect(await reloaded.getFoodById(food.id)).toMatchObject({ fiber: 0, b12: .000001, updated_at: food.updated_at, synced_at: null });
    expect(await reloaded.getFoodLogsWithFoodByDate('2026-01-01')).toHaveLength(1);
  });
  it('surfaces genuine nutrient ALTER failures instead of silently succeeding', async () => {
    mem.raw.exec(`CREATE TABLE foods (id TEXT PRIMARY KEY, name TEXT, brand TEXT, serving_units TEXT, calories REAL, protein REAL, carbs REAL, fat REAL, source TEXT, updated_at TEXT);`);
    const exec = mem.execAsync;
    mem.execAsync = async (sql: string) => {
      if (sql.includes('ALTER TABLE foods ADD COLUMN')) throw new Error('disk failure');
      return exec(sql);
    };
    await expect(database.getDatabase()).rejects.toThrow('disk failure');
  });
});


describe('food search metadata', () => {
  it('sees custom edits on the next search and hydrates accepted rows by ID', async () => {
    const custom = await database.addCustomFood(mk({ name: 'Peas' }));
    expect((await database.searchFoods('pea')).map(food => food.id)).toEqual([custom.id]);
    await database.updateCustomFood(custom.id, mk({ name: 'Apple' }));
    expect(await database.searchFoods('pea')).toEqual([]);
    expect(await database.getFoodSearchMetadata()).toEqual([expect.objectContaining({ id: custom.id, name: 'Apple' })]);
    expect((await database.getFoodsByIds([custom.id]))[0].name).toBe('Apple');
    expect(await database.getFoodsByIds([])).toEqual([]);
  });
  it('gates before the result limit so irrelevant short names cannot hide a winner', async () => {
    for (let i = 0; i < 55; i++) await database.cacheRemoteFood(mk({ id: `${i}`, name: 'Chicken soup' }));
    await database.cacheRemoteFood(mk({ id: 'winner', name: 'Chicken breast cooked' }));
    expect((await database.searchFoods('chiken breast', 1)).map(food => food.id)).toEqual(['winner']);
  });
});

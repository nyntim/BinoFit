import { createMemoryDb } from '@/test-utils/sqlite-memory';
import { nameForDate } from '@/lib/meals';

let mem: ReturnType<typeof createMemoryDb>;
let database: typeof import('@/lib/database');

beforeEach(() => {
  jest.resetModules();
  mem = createMemoryDb();
  const SQLite = require('expo-sqlite');
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  database = require('@/lib/database');
});

const insertFood = (id: string, source: string) =>
  mem.raw
    .prepare(
      `INSERT INTO foods (id,name,serving_units,calories,protein,carbs,fat,source,updated_at)
       VALUES (?, ?, '1',70,6,0,5,?,'x')`
    )
    .run(id, id, source);

const insertLog = (id: string, meal: string, updatedAt: string, synced: string | null = null) =>
  mem.raw
    .prepare(
      `INSERT INTO food_logs (id,date,meal_slot,food_id,serving_amount,serving_unit,created_at,updated_at,synced_at)
       VALUES (?,'2026-01-01',?, 'f1',1,'1','x',?,?)`
    )
    .run(id, meal, updatedAt, synced);

const remoteLog = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  date: '2026-02-02',
  meal_slot: 'lunch',
  food_id: 'f1',
  serving_amount: 2,
  serving_unit: '1',
  created_at: '2026-02-02T08:00:00+00:00',
  updated_at: '2026-02-02T08:00:00+00:00',
  ...over,
});

const remoteDef = (id: string, position: number, over: Record<string, unknown> = {}) => ({
  id,
  position,
  calorie_target: null,
  protein_target: null,
  carb_target: null,
  fat_target: null,
  reminder_time: null,
  created_at: '2026-01-01T00:00:00+00:00',
  updated_at: '2026-01-01T00:00:00+00:00',
  ...over,
});

const all = (sql: string): any[] => mem.raw.prepare(sql).all();

describe('isRemoteNewer', () => {
  it('is true only when the remote timestamp is strictly later', () => {
    expect(database.isRemoteNewer('2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z')).toBe(true);
    expect(database.isRemoteNewer('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z')).toBe(false);
    expect(database.isRemoteNewer('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')).toBe(false);
  });

  it('compares instants, not strings, across offset formats', () => {
    expect(database.isRemoteNewer('2026-01-01T01:00:00+00:00', '2026-01-01T00:30:00.000Z')).toBe(true);
    expect(database.isRemoteNewer('2026-01-01T00:00:00.500000+00:00', '2026-01-01T00:00:00.000Z')).toBe(true);
  });

  it('prefers remote when the local timestamp is unparseable', () => {
    expect(database.isRemoteNewer('2026-01-01T00:00:00Z', 'garbage')).toBe(true);
  });
});

describe('applyRemoteFoodLogs', () => {
  beforeEach(async () => {
    await database.getDatabase();
    insertFood('f1', 'custom');
  });

  it('returns 0 for no rows', async () => {
    expect(await database.applyRemoteFoodLogs([])).toBe(0);
  });

  it('inserts new rows marked synced', async () => {
    expect(await database.applyRemoteFoodLogs([remoteLog('a') as never])).toBe(1);
    const [row] = all("SELECT * FROM food_logs WHERE id='a'");
    expect(row.serving_amount).toBe(2);
    expect(row.synced_at).toBeTruthy();
    expect(row.updated_at).toBe('2026-02-02T08:00:00.000Z');
  });

  it('last write wins: a newer remote row replaces the local one', async () => {
    insertLog('a', 'breakfast', '2026-01-01T00:00:00.000Z');
    expect(await database.applyRemoteFoodLogs([remoteLog('a') as never])).toBe(1);
    const [row] = all("SELECT * FROM food_logs WHERE id='a'");
    expect(row.meal_slot).toBe('lunch');
    expect(row.serving_amount).toBe(2);
  });

  it('last write wins: an older remote row leaves the local one untouched', async () => {
    insertLog('a', 'breakfast', '2026-05-01T00:00:00.000Z');
    expect(await database.applyRemoteFoodLogs([remoteLog('a') as never])).toBe(0);
    const [row] = all("SELECT * FROM food_logs WHERE id='a'");
    expect(row.meal_slot).toBe('breakfast');
    expect(row.synced_at).toBeNull();
  });

  it('a tie keeps the local row', async () => {
    insertLog('a', 'breakfast', '2026-02-02T08:00:00.000Z');
    expect(await database.applyRemoteFoodLogs([remoteLog('a') as never])).toBe(0);
  });

  it('counts only applied rows in a mixed batch', async () => {
    insertLog('old', 'breakfast', '2026-09-01T00:00:00.000Z');
    const n = await database.applyRemoteFoodLogs([remoteLog('old') as never, remoteLog('new') as never]);
    expect(n).toBe(1);
    expect(all('SELECT id FROM food_logs ORDER BY id').map((r) => r.id)).toEqual(['new', 'old']);
  });
});

describe('getMissingFoodIds', () => {
  it('returns unique ids that have no local food row', async () => {
    await database.getDatabase();
    insertFood('have', 'branded');
    expect(await database.getMissingFoodIds(['have', 'gone', 'gone', 'off:123'])).toEqual(['gone', 'off:123']);
  });

  it('handles an empty list and lists larger than one batch', async () => {
    expect(await database.getMissingFoodIds([])).toEqual([]);
    const ids = Array.from({ length: 1200 }, (_, i) => `id-${i}`);
    expect(await database.getMissingFoodIds(ids)).toHaveLength(1200);
  });
});

describe('replaceMealsFromRemote', () => {
  it('is a no-op when the account has no meals', async () => {
    await database.replaceMealsFromRemote([], []);
    expect((await database.getMealDefinitions()).map((d) => d.id)).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
  });

  it('restores legacy and custom names over numbered defaults and keeps them after reopening', async () => {
    const seeded = await database.getMealNames();
    expect(seeded.find((n) => n.meal_id === 'breakfast')?.name).toBe('Meal 1');
    const legacy = [
      ['breakfast', 'Breakfast'], ['lunch', 'Lunch'],
      ['dinner', 'Dinner'], ['snack', 'Snacks'],
    ];
    const remoteNames = [
      ...legacy.map(([meal_id, name]) => ({ meal_id, name, effective_from: '0000-01-01',
        updated_at: '2025-01-01T00:00:00Z' })),
      { meal_id: 'breakfast', name: 'Morning', effective_from: '2026-05-01',
        updated_at: '2026-05-01T00:00:00Z' },
    ];
    await database.replaceMealsFromRemote(
      legacy.map(([id], position) => remoteDef(id, position) as never),
      remoteNames as never
    );
    const names = await database.getMealNames();
    expect(names.map((n) => [n.meal_id, n.name, n.effective_from])).toEqual([
      ['breakfast', 'Breakfast', '0000-01-01'],
      ['breakfast', 'Morning', '2026-05-01'],
      ['dinner', 'Dinner', '0000-01-01'],
      ['lunch', 'Lunch', '0000-01-01'],
      ['snack', 'Snacks', '0000-01-01'],
    ]);
    expect(nameForDate(names, 'breakfast', '2026-04-30')).toBe('Breakfast');
    expect(nameForDate(names, 'breakfast', '2026-05-01')).toBe('Morning');

    jest.resetModules();
    const SQLite = require('expo-sqlite');
    (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
    const again = require('@/lib/database') as typeof import('@/lib/database');
    expect(await again.getMealNames()).toEqual(names);
    expect((await again.getMealDefinitions()).map((d) => d.id)).toEqual(legacy.map(([id]) => id));
  });

  it('the account replaces seeded default meals that it lacks', async () => {
    await database.getMealDefinitions(); // seeds and marks nothing synced
    // seeded defaults count as synced once the account is known to lack them
    mem.raw.prepare("UPDATE meal_definitions SET synced_at='2026-01-01T00:00:00.000Z'").run();
    await database.replaceMealsFromRemote(
      [remoteDef('brunch', 0) as never, remoteDef('dinner', 1, { calorie_target: 700 }) as never],
      [{ meal_id: 'brunch', name: 'Brunch', effective_from: '1970-01-01', updated_at: '2026-01-01T00:00:00Z' } as never]
    );
    const defs = await database.getMealDefinitions();
    expect(defs.map((d) => d.id).sort()).toEqual(['brunch', 'dinner']);
    expect(defs.find((d) => d.id === 'dinner')?.calorie_target).toBe(700);
    expect(all('SELECT synced_at FROM meal_definitions').every((r) => r.synced_at)).toBe(true);
    expect(all("SELECT * FROM meal_names WHERE meal_id='breakfast'")).toHaveLength(0);
  });

  it('keeps a local meal that was never synced', async () => {
    await database.getMealDefinitions();
    await database.replaceMealsFromRemote([remoteDef('brunch', 0) as never], []);
    expect((await database.getMealDefinitions()).map((d) => d.id)).toContain('lunch');
  });

  it('keeps a synced local meal that still has logs', async () => {
    await database.getMealDefinitions();
    mem.raw.prepare("UPDATE meal_definitions SET synced_at='2026-01-01T00:00:00.000Z'").run();
    insertFood('f1', 'custom');
    insertLog('l1', 'lunch', '2026-01-01T00:00:00.000Z');
    await database.replaceMealsFromRemote([remoteDef('brunch', 0) as never], []);
    const ids = (await database.getMealDefinitions()).map((d) => d.id);
    expect(ids).toContain('lunch');
    expect(ids).not.toContain('breakfast');
  });

  it('removes a synced local name that the account no longer has', async () => {
    await database.getMealDefinitions();
    mem.raw.prepare("UPDATE meal_definitions SET synced_at='2026-01-01T00:00:00.000Z'").run();
    mem.raw
      .prepare("INSERT INTO meal_names (meal_id,name,effective_from,updated_at,synced_at) VALUES ('lunch','Midday','2026-03-01','x','2026-03-01T00:00:00.000Z')")
      .run();
    await database.replaceMealsFromRemote([remoteDef('lunch', 0) as never], [
      { meal_id: 'lunch', name: 'Lunch', effective_from: '0000-01-01', updated_at: '2026-01-01T00:00:00Z' } as never,
    ]);
    const names = all("SELECT name FROM meal_names WHERE meal_id='lunch'").map((r) => r.name);
    expect(names).toEqual(['Lunch']);
  });
});

describe('clearUserData', () => {
  it('removes user rows but keeps cached and USDA foods, then reseeds default meals', async () => {
    await database.getDatabase();
    insertFood('mine', 'custom');
    insertFood('cached', 'branded');
    insertFood('usda1', 'usda');
    insertFood('f1', 'custom');
    insertLog('l1', 'lunch', 'x');
    mem.raw.prepare("INSERT INTO water_logs (id,date,amount,drink_name,created_at) VALUES ('w','2026-01-01',250,'Water','x')").run();
    mem.raw.prepare("UPDATE meal_definitions SET position = position + 10").run();
    mem.raw.prepare("DELETE FROM meal_names WHERE meal_id='snack'").run();
    mem.raw.prepare("DELETE FROM meal_definitions WHERE id='snack'").run();

    await database.clearUserData();

    expect(all('SELECT id FROM food_logs')).toHaveLength(0);
    expect(all('SELECT id FROM water_logs')).toHaveLength(0);
    expect(all('SELECT id FROM foods ORDER BY id').map((r) => r.id)).toEqual(['cached', 'usda1']);
    const defs = await database.getMealDefinitions();
    expect(defs.map((d) => [d.id, d.position])).toEqual([
      ['breakfast', 0],
      ['lunch', 1],
      ['dinner', 2],
      ['snack', 3],
    ]);
    expect((await database.getMealNames()).length).toBeGreaterThanOrEqual(4);
  });
});

describe('custom food restore and owner lifecycle', () => {
  const custom = (over: Record<string, unknown> = {}) => ({ id: 'custom1', name: 'Mine', brand: null, serving_units: '100g', calories: 100, protein: 1, carbs: 2, fat: 3, source: 'custom', updated_at: '2026-01-01T01:00:00+01:00', fiber: 0, b12: .000001, ...over });
  it('restores unlogged definitions clean and applies strictly newer authoritative null clears', async () => {
    expect(await database.applyRemoteCustomFoods([custom()])).toBe(1);
    expect(await database.getFoodById('custom1')).toMatchObject({ fiber: 0, b12: .000001, updated_at: '2026-01-01T00:00:00.000Z', synced_at: expect.any(String) });
    expect(await database.applyRemoteCustomFoods([custom({ fiber: 9, updated_at: '2025-01-01' })])).toBe(0);
    expect(await database.applyRemoteCustomFoods([custom({ fiber: 9 })])).toBe(0);
    expect(await database.applyRemoteCustomFoods([custom({ b12: null, updated_at: '2026-02-01' })])).toBe(1);
    expect(await database.getFoodById('custom1')).toMatchObject({ b12: null });
    expect(await database.getUnsyncedCustomFoods()).toHaveLength(0);
  });
  it('preserves pending local edits and protects other food sources', async () => {
    await database.applyRemoteCustomFoods([custom()]);
    await database.updateCustomFood('custom1', custom({ fiber: 7 }));
    expect(await database.applyRemoteCustomFoods([custom({ fiber: 9, updated_at: '2999-01-01' })])).toBe(0);
    expect(await database.getFoodById('custom1')).toMatchObject({ fiber: 7, synced_at: null });
    await database.cacheRemoteFood(custom({ id: 'remote', source: 'branded' }));
    expect(await database.applyRemoteCustomFoods([custom({ id: 'remote', updated_at: '2999-01-01' })])).toBe(0);
  });
  it('owner reset resends custom definitions; wipe removes them and retains remote cache', async () => {
    await database.applyRemoteCustomFoods([custom()]);
    await database.cacheRemoteFood(custom({ id: 'remote', source: 'branded' }));
    await database.markAllUnsynced();
    expect((await database.getUnsyncedCustomFoods()).map((f) => f.id)).toEqual(['custom1']);
    await database.clearUserData();
    expect(await database.getFoodById('custom1')).toBeNull();
    expect(await database.getFoodById('remote')).not.toBeNull();
  });
});

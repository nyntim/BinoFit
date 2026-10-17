import { createMemoryDb } from '@/test-utils/sqlite-memory';

let mem: ReturnType<typeof createMemoryDb>;
let database: typeof import('@/lib/database');
let tomb: typeof import('@/lib/tombstones');

async function load(prepare?: (m: ReturnType<typeof createMemoryDb>) => void) {
  jest.resetModules();
  mem = createMemoryDb();
  prepare?.(mem);
  const SQLite = require('expo-sqlite');
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  database = require('@/lib/database');
  tomb = require('@/lib/tombstones');
  await database.getDatabase();
}

beforeEach(async () => {
  await load();
  mem.raw
    .prepare(
      `INSERT INTO foods (id,name,brand,serving_units,calories,protein,carbs,fat,source,updated_at)
       VALUES ('f1','Egg','Farm','1',70,6,0,5,'custom','x')`
    )
    .run();
});

const addLog = (id: string, date = '2026-06-01', slot = 'breakfast', deleted: string | null = null, synced: string | null = null) =>
  mem.raw
    .prepare(
      `INSERT INTO food_logs (id,date,meal_slot,food_id,serving_amount,serving_unit,created_at,updated_at,deleted_at,synced_at)
       VALUES (?,?,?,'f1',1,'1','2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z',?,?)`
    )
    .run(id, date, slot, deleted, synced);

const row = (id: string): any => mem.raw.prepare('SELECT * FROM food_logs WHERE id = ?').get(id);

describe('tombstoned rows are hidden from every read', () => {
  beforeEach(() => {
    addLog('live', '2026-06-01');
    addLog('dead', '2026-06-02', 'breakfast', '2026-06-02T00:00:00.000Z');
  });

  it('getFoodLogsByDate excludes tombstones', async () => {
    expect(await database.getFoodLogsByDate('2026-06-02')).toEqual([]);
    expect((await database.getFoodLogsByDate('2026-06-01')).map((l) => l.id)).toEqual(['live']);
  });

  it('getFoodLogsWithFoodByDate excludes tombstones', async () => {
    expect(await database.getFoodLogsWithFoodByDate('2026-06-02')).toEqual([]);
    expect(await database.getFoodLogsWithFoodByDate('2026-06-01')).toHaveLength(1);
  });

  it('getRecentFoods and getFrequentFoods ignore food that only has tombstoned logs', async () => {
    mem.raw.prepare('DELETE FROM food_logs').run();
    addLog('dead2', '2026-06-02', 'breakfast', '2026-06-02T00:00:00.000Z');
    expect(await database.getRecentFoods()).toEqual([]);
    expect(await database.getFrequentFoods()).toEqual([]);
  });

  it('getFrequentFoods does not count tombstoned logs', async () => {
    addLog('dead3', '2026-06-03', 'breakfast', '2026-06-03T00:00:00.000Z');
    const [f] = (await database.getFrequentFoods()) as any[];
    expect(f.log_count).toBe(1);
  });

  it('getRecentFoods ranks by last live log, not a tombstone', async () => {
    mem.raw
      .prepare(
        `INSERT INTO foods (id,name,brand,serving_units,calories,protein,carbs,fat,source,updated_at)
         VALUES ('f2','Toast','','1',80,3,15,1,'custom','x')`
      )
      .run();
    mem.raw
      .prepare(
        `INSERT INTO food_logs (id,date,meal_slot,food_id,serving_amount,serving_unit,created_at,updated_at,deleted_at)
         VALUES ('t','2026-06-09','breakfast','f2',1,'1','2026-06-09T00:00:00.000Z','x','2026-06-09T00:00:00.000Z')`
      )
      .run();
    expect((await database.getRecentFoods()).map((f) => f.id)).toEqual(['f1']);
  });

  it('getLoggedDates, getLoggedDatesInRange and getAllLoggedDates exclude tombstone-only dates', async () => {
    expect(await database.getLoggedDates()).toEqual(['2026-06-01']);
    expect(await database.getLoggedDatesInRange('2026-06-01', '2026-06-30')).toEqual(['2026-06-01']);
    expect(await database.getAllLoggedDates()).toEqual(['2026-06-01']);
  });

  it('countFoodLogsForMeal does not count tombstones', async () => {
    addLog('dead4', '2026-06-04', 'breakfast', '2026-06-04T00:00:00.000Z');
    expect(await database.countFoodLogsForMeal('breakfast')).toBe(1);
  });

  it('export path (getFoodLogsWithFoodInRange) excludes tombstones', async () => {
    const rows = await database.getFoodLogsWithFoodInRange(null, null);
    expect(rows.map((r) => r.id)).toEqual(['live']);
  });

  it('replaceMealsFromRemote removes a synced local meal that has only tombstoned logs', async () => {
    mem.raw
      .prepare(
        `INSERT INTO meal_definitions (id,position,created_at,updated_at,synced_at) VALUES ('gone',9,'x','x','x')`
      )
      .run();
    addLog('d', '2026-06-02', 'gone', '2026-06-02T00:00:00.000Z');
    await database.replaceMealsFromRemote(
      [
        {
          user_id: 'u', id: 'breakfast', position: 0, calorie_target: null, protein_target: null,
          carb_target: null, fat_target: null, reminder_time: null, created_at: null, updated_at: null,
        },
      ],
      []
    );
    expect(mem.raw.prepare("SELECT id FROM meal_definitions WHERE id='gone'").get()).toBeUndefined();
  });

  it('replaceMealsFromRemote keeps a synced local meal that still has a live log', async () => {
    mem.raw
      .prepare(
        `INSERT INTO meal_definitions (id,position,created_at,updated_at,synced_at) VALUES ('keep',9,'x','x','x')`
      )
      .run();
    addLog('l', '2026-06-02', 'keep');
    await database.replaceMealsFromRemote(
      [
        {
          user_id: 'u', id: 'breakfast', position: 0, calorie_target: null, protein_target: null,
          carb_target: null, fat_target: null, reminder_time: null, created_at: null, updated_at: null,
        },
      ],
      []
    );
    expect(mem.raw.prepare("SELECT id FROM meal_definitions WHERE id='keep'").get()).toBeDefined();
  });
});

describe('deleteFoodLog', () => {
  it('writes a tombstone instead of removing the row, and marks it unsynced', async () => {
    addLog('a', '2026-06-01', 'breakfast', null, '2026-06-01T00:00:00.000Z');
    await database.deleteFoodLog('a');
    const r = row('a');
    expect(r).toBeDefined();
    expect(r.deleted_at).toEqual(expect.any(String));
    expect(r.synced_at).toBeNull();
    expect(r.updated_at).toBe(r.deleted_at);
    expect((await database.getUnsyncedFoodLogs()).map((l) => l.id)).toContain('a');
  });

  it('deleting twice keeps the first deleted_at', async () => {
    addLog('a');
    await database.deleteFoodLog('a');
    const first = row('a').deleted_at;
    await new Promise((r) => setTimeout(r, 5));
    await database.deleteFoodLog('a');
    expect(row('a').deleted_at).toBe(first);
  });

  it('deleting an unknown id does nothing', async () => {
    await expect(database.deleteFoodLog('nope')).resolves.toBeUndefined();
  });

  it('makes no Supabase call', async () => {
    const { supabase } = require('@/lib/supabase');
    const spy = jest.spyOn(supabase, 'from');
    addLog('a', '2026-06-01', 'breakfast', null, 'x');
    await database.deleteFoodLog('a');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('updateFoodLog', () => {
  it('does not touch a tombstoned row', async () => {
    addLog('a', '2026-06-01', 'breakfast', '2026-06-02T00:00:00.000Z', '2026-06-02T00:00:01.000Z');
    await database.updateFoodLog('a', 5, '1');
    const r = row('a');
    expect(r.serving_amount).toBe(1);
    expect(r.updated_at).toBe('2026-06-01T00:00:00.000Z');
    expect(r.synced_at).toBe('2026-06-02T00:00:01.000Z');
  });

  it('still edits a live row and marks it unsynced', async () => {
    addLog('a', '2026-06-01', 'breakfast', null, 'x');
    await database.updateFoodLog('a', 3, '1');
    expect(row('a')).toMatchObject({ serving_amount: 3, synced_at: null });
  });
});

describe('saveMealDraft', () => {
  it('tombstones the deleted meal logs, leaves other meals alone, and makes no Supabase call', async () => {
    const { supabase } = require('@/lib/supabase');
    const spy = jest.spyOn(supabase, 'from');
    addLog('b1', '2026-06-01', 'breakfast', null, 'x');
    addLog('l1', '2026-06-01', 'lunch', null, 'x');
    await database.saveMealDraft({ meals: [], deletedIds: ['breakfast'] }, '2026-06-05');
    const b = row('b1');
    expect(b).toBeDefined();
    expect(b.deleted_at).toEqual(expect.any(String));
    expect(b.synced_at).toBeNull();
    expect(row('l1').deleted_at).toBeNull();
    expect(await database.countFoodLogsForMeal('breakfast')).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('markRowsSynced', () => {
  it('marks a row synced when updated_at is unchanged', async () => {
    addLog('a');
    await tomb.markRowsSynced('food_logs', [{ id: 'a', updated_at: '2026-06-01T00:00:00.000Z' }]);
    expect(row('a').synced_at).not.toBeNull();
  });

  it('leaves a row unsynced if it was edited after the snapshot', async () => {
    addLog('a');
    const snapshot = { id: 'a', updated_at: '2026-06-01T00:00:00.000Z' };
    mem.raw.prepare("UPDATE food_logs SET updated_at='2026-06-01T00:00:09.000Z', synced_at=NULL WHERE id='a'").run();
    await tomb.markRowsSynced('food_logs', [snapshot]);
    expect(row('a').synced_at).toBeNull();
  });

  it('leaves a row unsynced if it was tombstoned after the snapshot', async () => {
    addLog('a');
    const [snap] = await database.getUnsyncedFoodLogs();
    await new Promise((r) => setTimeout(r, 5));
    await database.deleteFoodLog('a');
    await tomb.markRowsSynced('food_logs', [{ id: snap.id, updated_at: snap.updated_at }]);
    expect(row('a').synced_at).toBeNull();
  });

  it('handles an empty list and rejects tables that are not allow-listed', async () => {
    await expect(tomb.markRowsSynced('food_logs', [])).resolves.toBeUndefined();
    await expect(tomb.markRowsSynced('foods; DROP TABLE foods', [{ id: 'a', updated_at: 'x' }])).rejects.toThrow();
    await expect(tomb.purgeSyncedTombstones('foods')).rejects.toThrow();
    expect(() => tomb.tombstoneSql('meal_definitions')).toThrow();
  });
});

describe('purgeSyncedTombstones', () => {
  it('removes only tombstones that are synced', async () => {
    addLog('live-synced', '2026-06-01', 'breakfast', null, 's');
    addLog('dead-synced', '2026-06-01', 'breakfast', 'd', 's');
    addLog('dead-unsynced', '2026-06-01', 'breakfast', 'd', null);
    await tomb.purgeSyncedTombstones('food_logs');
    const ids = mem.raw.prepare('SELECT id FROM food_logs ORDER BY id').all().map((r: any) => r.id);
    expect(ids).toEqual(['dead-unsynced', 'live-synced']);
  });
});

describe('decideRemoteApply', () => {
  const L = { updated_at: '2026-06-01T10:00:00.000Z' };
  const older = '2026-06-01T09:00:00.000Z';
  const newer = '2026-06-01T11:00:00.000Z';

  it('upserts a live remote row with no local copy', () => {
    expect(tomb.decideRemoteApply({ updated_at: older }, null)).toBe('upsert');
  });
  it('skips a remote tombstone with no local copy', () => {
    expect(tomb.decideRemoteApply({ updated_at: newer, deleted_at: newer }, null)).toBe('skip');
  });
  it('upserts a newer live remote row', () => {
    expect(tomb.decideRemoteApply({ updated_at: newer }, L)).toBe('upsert');
  });
  it('deletes locally for a newer remote tombstone', () => {
    expect(tomb.decideRemoteApply({ updated_at: newer, deleted_at: newer }, L)).toBe('delete');
  });
  it('skips an older remote row, live or tombstone', () => {
    expect(tomb.decideRemoteApply({ updated_at: older }, L)).toBe('skip');
    expect(tomb.decideRemoteApply({ updated_at: older, deleted_at: older }, L)).toBe('skip');
  });
  it('ties keep local, live or tombstone', () => {
    expect(tomb.decideRemoteApply({ updated_at: L.updated_at }, L)).toBe('skip');
    expect(tomb.decideRemoteApply({ updated_at: L.updated_at, deleted_at: L.updated_at }, L)).toBe('skip');
  });
  it('compares instants across timezone offsets', () => {
    expect(tomb.decideRemoteApply({ updated_at: '2026-06-01T11:30:00+02:00' }, L)).toBe('skip');
    expect(tomb.decideRemoteApply({ updated_at: '2026-06-01T11:30:00+00:00' }, L)).toBe('upsert');
  });
  it('skips a remote row with a missing updated_at when local has one', () => {
    expect(tomb.decideRemoteApply({ updated_at: null }, L)).toBe('skip');
  });
});

describe('applyRemoteFoodLogs', () => {
  const remote = (over: any = {}) => ({
    id: 'a', user_id: 'u', date: '2026-06-01', meal_slot: 'breakfast', food_id: 'f1',
    serving_amount: 2, serving_unit: '1', created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-02T00:00:00.000Z', deleted_at: null, ...over,
  });

  it('hard-deletes the local row for a newer remote tombstone and does not count it', async () => {
    addLog('a', '2026-06-01', 'breakfast', null, 's');
    const n = await database.applyRemoteFoodLogs([remote({ deleted_at: '2026-06-02T00:00:00.000Z' })]);
    expect(n).toBe(0);
    expect(row('a')).toBeUndefined();
  });

  it('ignores a remote tombstone when there is no local row', async () => {
    const n = await database.applyRemoteFoodLogs([remote({ deleted_at: '2026-06-02T00:00:00.000Z' })]);
    expect(n).toBe(0);
    expect(row('a')).toBeUndefined();
  });

  it('keeps a local row that is newer than the remote tombstone', async () => {
    mem.raw
      .prepare(
        `INSERT INTO food_logs (id,date,meal_slot,food_id,serving_amount,serving_unit,created_at,updated_at)
         VALUES ('a','2026-06-01','breakfast','f1',9,'1','x','2026-06-03T00:00:00.000Z')`
      )
      .run();
    await database.applyRemoteFoodLogs([remote({ deleted_at: '2026-06-02T00:00:00.000Z' })]);
    expect(row('a').serving_amount).toBe(9);
  });

  it('keeps a local tombstone when the remote row is older or a tie', async () => {
    addLog('a', '2026-06-01', 'breakfast', '2026-06-01T00:00:00.000Z');
    await database.applyRemoteFoodLogs([remote({ updated_at: '2026-06-01T00:00:00.000Z' })]);
    expect(row('a').deleted_at).not.toBeNull();
  });

  it('a newer live remote row revives a local tombstone', async () => {
    addLog('a', '2026-06-01', 'breakfast', '2026-06-01T00:00:00.000Z');
    await database.applyRemoteFoodLogs([remote()]);
    const r = row('a');
    expect(r.deleted_at).toBeNull();
    expect(r.serving_amount).toBe(2);
    expect(r.synced_at).not.toBeNull();
  });

  it('inserts a live remote row that is new locally', async () => {
    expect(await database.applyRemoteFoodLogs([remote({ id: 'new' })])).toBe(1);
    expect(row('new').deleted_at).toBeNull();
  });
});

describe('migration on an old schema', () => {
  it('adds deleted_at to an existing food_logs table and keeps its rows', async () => {
    await load((m) => {
      m.raw.exec(`
        CREATE TABLE foods (id TEXT PRIMARY KEY, name TEXT NOT NULL, brand TEXT, serving_units TEXT NOT NULL,
          calories REAL NOT NULL, protein REAL NOT NULL, carbs REAL NOT NULL, fat REAL NOT NULL,
          source TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE food_logs (id TEXT PRIMARY KEY, date TEXT NOT NULL, meal_slot TEXT NOT NULL,
          food_id TEXT NOT NULL, serving_amount REAL NOT NULL, serving_unit TEXT NOT NULL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        INSERT INTO foods VALUES ('f1','Egg','', '1',70,6,0,5,'custom','x');
        INSERT INTO food_logs VALUES ('old','2026-06-01','breakfast','f1',1,'1','c','u');
      `);
    });
    const cols = mem.raw.prepare('PRAGMA table_info(food_logs)').all().map((c: any) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['deleted_at', 'synced_at']));
    expect((await database.getFoodLogsByDate('2026-06-01')).map((l) => l.id)).toEqual(['old']);
    await database.deleteFoodLog('old');
    expect(await database.getFoodLogsByDate('2026-06-01')).toEqual([]);
    expect(row('old').deleted_at).not.toBeNull();
  });
});

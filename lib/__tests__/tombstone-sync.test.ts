import { createMemoryDb } from '@/test-utils/sqlite-memory';

const mockUpsert = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { from: (table: string) => ({ upsert: (...a: unknown[]) => table === 'food_logs' ? mockUpsert(...a) : Promise.resolve({ error: null }) }) } }));
jest.mock('@/lib/auth', () => ({
  getSessionUserId: jest.fn(async () => 'uid'),
  initAuth: jest.fn(async () => ({ status: 'none', restored: false })),
  retryPendingMergeTicket: jest.fn(async () => {}),
  reconcileSyncedUid: jest.fn(async () => {}),
}));
jest.mock('@/lib/storage', () => ({
  getUserGoals: jest.fn(async () => null),
  getUserProfile: jest.fn(async () => null),
  markGoalsSynced: jest.fn(async () => {}),
  markProfileSynced: jest.fn(async () => {}),
  setLastSyncAt: jest.fn(async () => {}),
}));

let mem: ReturnType<typeof createMemoryDb>;
let database: typeof import('@/lib/database');
let sync: typeof import('@/lib/sync');

beforeEach(async () => {
  jest.resetModules();
  mockUpsert.mockReset().mockResolvedValue({ error: null });
  mem = createMemoryDb();
  const SQLite = require('expo-sqlite');
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  database = require('@/lib/database');
  sync = require('@/lib/sync');
  await database.getDatabase();
  mem.raw
    .prepare(
      `INSERT INTO foods (id,name,brand,serving_units,calories,protein,carbs,fat,source,updated_at)
       VALUES ('f1','Egg','','1',70,6,0,5,'custom','x')`
    )
    .run();
  // These tests isolate log upload races; the definition has already synced.
  mem.raw.prepare("UPDATE foods SET synced_at = 'synced' WHERE id = 'f1'").run();
});

const insert = (id: string) =>
  mem.raw
    .prepare(
      `INSERT INTO food_logs (id,date,meal_slot,food_id,serving_amount,serving_unit,created_at,updated_at)
       VALUES (?,'2026-06-01','breakfast','f1',1,'1','2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z')`
    )
    .run(id);
const pushedLogs = (): any[] =>
  mockUpsert.mock.calls.flatMap((c) => c[0] as any[]).filter((r) => r.meal_slot !== undefined);
const row = (id: string): any => mem.raw.prepare('SELECT * FROM food_logs WHERE id = ?').get(id);

describe('food log sync with tombstones', () => {
  it('pushes deleted_at for a tombstone, then purges it locally', async () => {
    insert('a');
    await sync.syncToSupabase();
    expect(row('a').synced_at).not.toBeNull();
    await new Promise((r) => setTimeout(r, 5));
    await database.deleteFoodLog('a');
    mockUpsert.mockClear();
    await sync.syncToSupabase();
    const pushed = pushedLogs();
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({ id: 'a', user_id: 'uid', deleted_at: expect.any(String) });
    expect(row('a')).toBeUndefined();
  });

  it('pushes deleted_at null for live rows', async () => {
    insert('a');
    await sync.syncToSupabase();
    expect(pushedLogs()[0].deleted_at).toBeNull();
  });

  it('keeps the tombstone when the push fails', async () => {
    insert('a');
    await database.deleteFoodLog('a');
    mockUpsert.mockResolvedValue({ error: new Error('boom') });
    await sync.syncToSupabase();
    const r = row('a');
    expect(r).toBeDefined();
    expect(r.synced_at).toBeNull();
    expect(r.deleted_at).not.toBeNull();
  });

  it('a row edited during the push stays unsynced and is pushed again next time', async () => {
    insert('a');
    mockUpsert.mockImplementationOnce(async () => {
      mem.raw
        .prepare("UPDATE food_logs SET serving_amount=5, updated_at='2026-06-01T00:00:09.000Z', synced_at=NULL WHERE id='a'")
        .run();
      return { error: null };
    });
    await sync.syncToSupabase();
    expect(row('a').synced_at).toBeNull();
    await sync.syncToSupabase();
    expect(pushedLogs().slice(-1)[0].serving_amount).toBe(5);
    expect(row('a').synced_at).not.toBeNull();
  });

  it('a row deleted during the push is not purged and is pushed as a tombstone next time', async () => {
    insert('a');
    mockUpsert.mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 5));
      await database.deleteFoodLog('a');
      return { error: null };
    });
    await sync.syncToSupabase();
    expect(row('a')).toBeDefined();
    await sync.syncToSupabase();
    expect(pushedLogs().slice(-1)[0].deleted_at).toEqual(expect.any(String));
    expect(row('a')).toBeUndefined();
  });
});

import { createMemoryDb } from '@/test-utils/sqlite-memory';

const mockUpsert = jest.fn();
let mockProfile: { weight: number | null; height: number | null; activity_level: string | null } | null = null;
jest.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ upsert: (...a: unknown[]) => mockUpsert(...a) }) } }));
jest.mock('@/lib/auth', () => ({
  getSessionUserId: jest.fn(async () => 'uid'),
  initAuth: jest.fn(async () => ({ status: 'none', restored: false })),
  retryPendingMergeTicket: jest.fn(async () => {}),
  reconcileSyncedUid: jest.fn(async () => {}),
}));
jest.mock('@/lib/storage', () => ({
  getUserGoals: jest.fn(async () => null),
  getUserProfile: jest.fn(async () => mockProfile),
  saveUserProfile: jest.fn(async (p: any) => {
    mockProfile = { ...p };
  }),
  markGoalsSynced: jest.fn(async () => {}),
  markProfileSynced: jest.fn(async () => {}),
  setLastSyncAt: jest.fn(async () => {}),
}));

let mem: ReturnType<typeof createMemoryDb>;
let database: typeof import('@/lib/database');
let weight: typeof import('@/lib/weight');
let sync: typeof import('@/lib/sync');

async function load(prepare?: (m: ReturnType<typeof createMemoryDb>) => void) {
  jest.resetModules();
  mem = createMemoryDb();
  prepare?.(mem);
  const SQLite = require('expo-sqlite');
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  database = require('@/lib/database');
  weight = require('@/lib/weight');
  sync = require('@/lib/sync');
  await database.getDatabase();
}

beforeEach(async () => {
  mockUpsert.mockReset().mockResolvedValue({ error: null });
  mockProfile = null;
  await load();
});

const tick = () => new Promise((r) => setTimeout(r, 5));
const insert = (
  id: string,
  date: string,
  kg: number,
  o: {
    measured?: string;
    created?: string;
    deleted?: string | null;
    synced?: string | null;
    updated?: string;
    source?: string;
  } = {}
) =>
  mem.raw
    .prepare(
      `INSERT INTO weight_entries (id,date,weight_kg,measured_at,source,created_at,updated_at,synced_at,deleted_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(
      id,
      date,
      kg,
      o.measured ?? `${date}T12:00:00.000Z`,
      o.source ?? 'manual',
      o.created ?? `${date}T12:00:00.000Z`,
      o.updated ?? `${date}T12:00:00.000Z`,
      o.synced ?? null,
      o.deleted ?? null
    );
const row = (id: string): any => mem.raw.prepare('SELECT * FROM weight_entries WHERE id = ?').get(id);
const count = (): number => (mem.raw.prepare('SELECT COUNT(*) AS n FROM weight_entries').get() as any).n;

describe('pure helpers', () => {
  const e = (id: string, date: string, measured: string, created = measured) => ({
    id,
    date,
    measured_at: measured,
    created_at: created,
  });

  it('pickLatest prefers the later date, then measured_at, then created_at, then id', () => {
    expect(weight.pickLatest([])).toBeNull();
    expect(weight.pickLatest([e('a', '2026-06-01', 'x'), e('b', '2026-06-02', 'a')])!.id).toBe('b');
    expect(weight.pickLatest([e('a', '2026-06-01', '2026-06-01T08:00'), e('b', '2026-06-01', '2026-06-01T20:00')])!.id).toBe('b');
    expect(weight.pickLatest([e('a', '2026-06-01', 'm', 'c1'), e('b', '2026-06-01', 'm', 'c2')])!.id).toBe('b');
    expect(weight.pickLatest([e('a', '2026-06-01', 'm', 'c'), e('b', '2026-06-01', 'm', 'c')])!.id).toBe('b');
  });

  it('collapseLatestPerDay keeps the latest measured_at per day, newest day first', () => {
    const out = weight.collapseLatestPerDay([
      e('old1', '2026-06-01', '2026-06-01T08:00'),
      e('new1', '2026-06-01', '2026-06-01T20:00'),
      e('d2', '2026-06-03', '2026-06-03T08:00'),
      e('d3', '2026-06-02', '2026-06-02T08:00'),
    ]);
    expect(out.map((x) => x.id)).toEqual(['d2', 'd3', 'new1']);
  });

  it('resolveBodyweightKg uses the entry, then profile weight, then null', () => {
    expect(weight.resolveBodyweightKg({ weight_kg: 80 }, { weight: 70 })).toBe(80);
    expect(weight.resolveBodyweightKg(null, { weight: 70 })).toBe(70);
    expect(weight.resolveBodyweightKg(undefined, { weight: null })).toBeNull();
    expect(weight.resolveBodyweightKg(null, null)).toBeNull();
  });

  it('range validation accepts 20 and 400 kg and rejects just outside', () => {
    expect(weight.isValidWeightKg(20)).toBe(true);
    expect(weight.isValidWeightKg(400)).toBe(true);
    expect(weight.isValidWeightKg(19.99)).toBe(false);
    expect(weight.isValidWeightKg(400.01)).toBe(false);
    expect(weight.isValidWeightKg(NaN)).toBe(false);
    expect(weight.isValidWeightKg(Infinity)).toBe(false);
    expect(weight.weightInputToKg('20', 'kg')).toBe(20);
    expect(weight.weightInputToKg('400', 'kg')).toBe(400);
    expect(weight.weightInputToKg('19.9', 'kg')).toBeNull();
    expect(weight.weightInputToKg('400.5', 'kg')).toBeNull();
    expect(weight.weightInputToKg('abc', 'kg')).toBeNull();
    expect(weight.weightInputToKg('', 'lb')).toBeNull();
  });

  it('lb input is range checked in kg and the messages state the bounds', () => {
    expect(weight.weightInputToKg('44', 'lb')).toBeNull(); // 19.96 kg
    expect(weight.weightInputToKg('45', 'lb')).not.toBeNull();
    expect(weight.weightInputToKg('881', 'lb')).not.toBeNull(); // 399.6 kg
    expect(weight.weightInputToKg('882', 'lb')).toBeNull(); // 400.07 kg
    expect(weight.weightRangeMessage('kg')).toBe('Enter a weight between 20 and 400 kg.');
    expect(weight.weightRangeMessage('lb')).toBe('Enter a weight between 45 and 881 lb.');
  });

  it('180 lb round trips through kg without drift', () => {
    const kg = weight.weightInputToKg('180', 'lb')!;
    const { formatWeight } = require('@/lib/units');
    expect(formatWeight(kg, 'lb')).toBe('180');
  });

  it('formatWeightChange signs the change and shows 0 when it rounds to nothing', () => {
    expect(weight.formatWeightChange(79.4, 80, 'kg')).toBe('−0.6 kg');
    expect(weight.formatWeightChange(81.2, 80, 'kg')).toBe('+1.2 kg');
    expect(weight.formatWeightChange(80.001, 80, 'kg')).toBe('0 kg');
    expect(weight.formatWeightChange(80, 80, 'lb')).toBe('0 lb');
  });
});

describe('lookup by date', () => {
  it('getWeightOnOrBefore returns the latest entry on or before the date', async () => {
    insert('a', '2026-06-01', 80);
    insert('b', '2026-06-05', 79);
    insert('c', '2026-06-10', 78);
    expect((await weight.getWeightOnOrBefore('2026-06-05'))!.id).toBe('b');
    expect((await weight.getWeightOnOrBefore('2026-06-09'))!.id).toBe('b');
    expect((await weight.getWeightOnOrBefore('2026-12-31'))!.id).toBe('c');
    expect(await weight.getWeightOnOrBefore('2026-05-31')).toBeNull();
  });

  it('lookup before the first entry gives null so the profile fallback applies, then null without a profile', async () => {
    insert('a', '2026-06-05', 80);
    const none = await weight.getWeightOnOrBefore('2026-06-01');
    expect(weight.resolveBodyweightKg(none, { weight: 75 })).toBe(75);
    expect(weight.resolveBodyweightKg(none, { weight: null })).toBeNull();
    const hit = await weight.getWeightOnOrBefore('2026-06-06');
    expect(weight.resolveBodyweightKg(hit, { weight: 75 })).toBe(80);
  });

  it('latest of a day wins by measured_at, ties fall to created_at', async () => {
    insert('am', '2026-06-01', 80, { measured: '2026-06-01T08:00:00.000Z' });
    insert('pm', '2026-06-01', 79, { measured: '2026-06-01T20:00:00.000Z' });
    expect((await weight.getWeightOnOrBefore('2026-06-01'))!.id).toBe('pm');
    insert('t1', '2026-06-02', 70, { measured: 'M', created: '2026-06-02T01:00:00.000Z' });
    insert('t2', '2026-06-02', 71, { measured: 'M', created: '2026-06-02T02:00:00.000Z' });
    expect((await weight.getLatestWeightEntry())!.id).toBe('t2');
  });

  it('getRecentWeightDays returns one entry per day for the n most recent days, newest first', async () => {
    insert('a1', '2026-06-01', 80, { measured: '2026-06-01T08:00:00.000Z' });
    insert('a2', '2026-06-01', 79, { measured: '2026-06-01T20:00:00.000Z' });
    insert('b', '2026-06-02', 78);
    insert('c', '2026-06-03', 77);
    const out = await weight.getRecentWeightDays(2);
    expect(out.map((x) => x.id)).toEqual(['c', 'b']);
    const all = await weight.getRecentWeightDays(10);
    expect(all.map((x) => x.id)).toEqual(['c', 'b', 'a2']);
  });
});

describe('reads exclude tombstones', () => {
  it('latest, on-or-before and recent days ignore deleted rows; unsynced includes them', async () => {
    insert('live', '2026-06-01', 80);
    insert('dead', '2026-06-02', 70, { deleted: '2026-06-02T13:00:00.000Z' });
    expect((await weight.getLatestWeightEntry())!.id).toBe('live');
    expect((await weight.getWeightOnOrBefore('2026-06-05'))!.id).toBe('live');
    expect((await weight.getRecentWeightDays(5)).map((x) => x.id)).toEqual(['live']);
    expect((await weight.getUnsyncedWeightEntries()).map((x) => x.id).sort()).toEqual(['dead', 'live']);
  });

  it('a tombstone does not count as a day when limiting recent days', async () => {
    insert('a', '2026-06-01', 80);
    insert('b', '2026-06-02', 79);
    insert('dead', '2026-06-03', 70, { deleted: '2026-06-03T13:00:00.000Z' });
    expect((await weight.getRecentWeightDays(2)).map((x) => x.id)).toEqual(['b', 'a']);
  });
});

describe('weight_entries.source', () => {
  it('defaults existing rows to manual', () => {
    insert('legacy', '2026-06-01', 80);
    expect(row('legacy').source).toBe('manual');
  });

  it('saveWeightEntry on a healthkit row sets source to manual', async () => {
    insert('hk', '2026-06-01', 80, { source: 'healthkit' });
    await weight.saveWeightEntry({ date: '2026-06-01', weight_kg: 81 });
    expect(row('hk')).toMatchObject({ source: 'manual', weight_kg: 81 });
  });

  it('applyHealthWeightPlan with an empty import plan does not add rows', async () => {
    insert('m', '2026-06-01', 80);
    expect(await weight.applyHealthWeightPlan([])).toBe(false);
    expect(count()).toBe(1);
  });

  it('profile updates only when the imported row is the latest', async () => {
    await weight.saveWeightEntry({ date: '2026-06-10', weight_kg: 78 });
    const back = await weight.applyHealthWeightPlan([
      {
        type: 'insert',
        date: '2026-06-01',
        weight_kg: 90,
        measured_at: '2026-06-01T08:00:00.000Z',
        hkSampleId: 'sample-1',
      },
    ]);
    expect(back).toBe(true);
    expect(mockProfile!.weight).toBe(78);
    await weight.applyHealthWeightPlan([
      {
        type: 'insert',
        date: '2026-06-20',
        weight_kg: 76,
        measured_at: '2026-06-20T08:00:00.000Z',
        hkSampleId: 'sample-2',
      },
    ]);
    expect(mockProfile!.weight).toBe(76);
  });
});

describe('saveWeightEntry', () => {
  it('throws outside 20 to 400 kg and writes nothing', async () => {
    await expect(weight.saveWeightEntry({ weight_kg: 19.9 })).rejects.toThrow();
    await expect(weight.saveWeightEntry({ weight_kg: 400.1 })).rejects.toThrow();
    await expect(weight.saveWeightEntry({ weight_kg: NaN })).rejects.toThrow();
    expect(count()).toBe(0);
    await expect(weight.saveWeightEntry({ date: '2026-06-01', weight_kg: 20 })).resolves.toBeDefined();
    await expect(weight.saveWeightEntry({ date: '2026-06-02', weight_kg: 400 })).resolves.toBeDefined();
  });

  it('saving the same day again updates the row instead of inserting', async () => {
    const first = await weight.saveWeightEntry({ date: '2026-06-01', weight_kg: 80 });
    await tick();
    const second = await weight.saveWeightEntry({ date: '2026-06-01', weight_kg: 79 });
    expect(count()).toBe(1);
    expect(second.id).toBe(first.id);
    expect(row(first.id)).toMatchObject({ weight_kg: 79, synced_at: null, deleted_at: null });
    expect(row(first.id).updated_at > first.updated_at).toBe(true);
  });

  it('saving a day whose only row is a tombstone inserts a new live row', async () => {
    insert('dead', '2026-06-01', 70, { deleted: '2026-06-01T13:00:00.000Z' });
    const saved = await weight.saveWeightEntry({ date: '2026-06-01', weight_kg: 80 });
    expect(saved.id).not.toBe('dead');
    expect(row('dead').deleted_at).not.toBeNull();
    expect((await weight.getLatestWeightEntry())!.id).toBe(saved.id);
  });

  it('a backdated entry uses local noon for measured_at and does not change profile.weight', async () => {
    await weight.saveWeightEntry({ weight_kg: 80 });
    expect(mockProfile!.weight).toBe(80);
    const saved = await weight.saveWeightEntry({ date: '2020-01-15', weight_kg: 90 });
    expect(mockProfile!.weight).toBe(80);
    expect(new Date(saved.measured_at).getHours()).toBe(12);
  });

  it('today entry sets profile.weight and keeps height and activity level', async () => {
    mockProfile = { weight: 70, height: 180, activity_level: 'active' };
    await weight.saveWeightEntry({ weight_kg: 82.5 });
    expect(mockProfile).toMatchObject({ weight: 82.5, height: 180, activity_level: 'active' });
  });

  it('a newer-dated entry becomes the profile weight; an older one saved after does not', async () => {
    await weight.saveWeightEntry({ date: '2026-06-10', weight_kg: 80 });
    expect(mockProfile!.weight).toBe(80);
    await weight.saveWeightEntry({ date: '2026-06-01', weight_kg: 90 });
    expect(mockProfile!.weight).toBe(80);
    await weight.saveWeightEntry({ date: '2026-06-20', weight_kg: 78 });
    expect(mockProfile!.weight).toBe(78);
  });

  it('a 180 lb entry round trips back to 180 lb', async () => {
    const kg = weight.weightInputToKg('180', 'lb')!;
    await weight.saveWeightEntry({ date: '2026-06-01', weight_kg: kg });
    const back = (await weight.getLatestWeightEntry())!.weight_kg;
    expect(back).toBe(kg);
    expect(require('@/lib/units').formatWeight(back, 'lb')).toBe('180');
  });
});

describe('deleteWeightEntriesForDate', () => {
  it('tombstones every row of the day, unsynced, and leaves other days alone', async () => {
    insert('a', '2026-06-01', 80, { synced: 'x' });
    insert('b', '2026-06-01', 79, { synced: 'x', measured: '2026-06-01T20:00:00.000Z' });
    insert('c', '2026-06-02', 78);
    await weight.deleteWeightEntriesForDate('2026-06-01');
    for (const id of ['a', 'b']) expect(row(id)).toMatchObject({ synced_at: null, deleted_at: expect.any(String) });
    expect(row('c').deleted_at).toBeNull();
  });

  it('deleting the latest moves profile.weight to the next latest', async () => {
    await weight.saveWeightEntry({ date: '2026-06-01', weight_kg: 80 });
    await weight.saveWeightEntry({ date: '2026-06-10', weight_kg: 78 });
    expect(mockProfile!.weight).toBe(78);
    await weight.deleteWeightEntriesForDate('2026-06-10');
    expect(mockProfile!.weight).toBe(80);
  });

  it('deleting a non-latest day leaves profile.weight unchanged', async () => {
    await weight.saveWeightEntry({ date: '2026-06-01', weight_kg: 80 });
    await weight.saveWeightEntry({ date: '2026-06-10', weight_kg: 78 });
    await weight.deleteWeightEntriesForDate('2026-06-01');
    expect(mockProfile!.weight).toBe(78);
  });

  it('deleting every entry leaves profile.weight unchanged', async () => {
    await weight.saveWeightEntry({ date: '2026-06-01', weight_kg: 80 });
    await weight.deleteWeightEntriesForDate('2026-06-01');
    expect(await weight.getLatestWeightEntry()).toBeNull();
    expect(mockProfile!.weight).toBe(80);
  });
});

describe('sync', () => {
  const pushed = (): any[] => mockUpsert.mock.calls.flatMap((c) => c[0] as any[]).filter((r) => r.weight_kg !== undefined);

  it('pushes live rows with deleted_at null, then marks them synced', async () => {
    insert('a', '2026-06-01', 80);
    await sync.syncToSupabase();
    expect(pushed()).toHaveLength(1);
    expect(pushed()[0]).toMatchObject({ id: 'a', user_id: 'uid', weight_kg: 80, date: '2026-06-01', deleted_at: null });
    expect(row('a').synced_at).not.toBeNull();
  });

  it('pushes deleted_at for a tombstone, then purges it locally', async () => {
    insert('a', '2026-06-01', 80);
    await sync.syncToSupabase();
    await tick();
    await weight.deleteWeightEntriesForDate('2026-06-01');
    mockUpsert.mockClear();
    await sync.syncToSupabase();
    expect(pushed()).toHaveLength(1);
    expect(pushed()[0]).toMatchObject({ id: 'a', deleted_at: expect.any(String) });
    expect(row('a')).toBeUndefined();
  });

  it('keeps the tombstone when the push fails', async () => {
    insert('a', '2026-06-01', 80);
    await weight.deleteWeightEntriesForDate('2026-06-01');
    mockUpsert.mockResolvedValue({ error: new Error('boom') });
    await sync.syncToSupabase().catch(() => {});
    expect(row('a')).toMatchObject({ synced_at: null, deleted_at: expect.any(String) });
  });

  it('a row edited during the push stays unsynced and is pushed again', async () => {
    insert('a', '2026-06-01', 80);
    mockUpsert.mockImplementationOnce(async () => {
      mem.raw
        .prepare("UPDATE weight_entries SET weight_kg=75, updated_at='2026-06-01T12:00:09.000Z', synced_at=NULL WHERE id='a'")
        .run();
      return { error: null };
    });
    await sync.syncToSupabase();
    await sync.syncToSupabase();
    expect(pushed().slice(-1)[0].weight_kg).toBe(75);
    expect(row('a').synced_at).not.toBeNull();
  });

  it('a row deleted during the push is not purged and goes out as a tombstone next time', async () => {
    insert('a', '2026-06-01', 80);
    mockUpsert.mockImplementationOnce(async () => {
      await tick();
      await weight.deleteWeightEntriesForDate('2026-06-01');
      return { error: null };
    });
    await sync.syncToSupabase();
    expect(row('a')).toBeDefined();
    await sync.syncToSupabase();
    expect(pushed().slice(-1)[0].deleted_at).toEqual(expect.any(String));
    expect(row('a')).toBeUndefined();
  });
});

describe('applyRemoteWeightEntries', () => {
  const remote = (o: Record<string, unknown> = {}): any => ({
    id: 'r1',
    user_id: 'uid',
    date: '2026-06-01',
    weight_kg: 80,
    measured_at: '2026-06-01T12:00:00+00:00',
    created_at: '2026-06-01T12:00:00+00:00',
    updated_at: '2026-06-01T12:00:00+00:00',
    deleted_at: null,
    ...o,
  });

  it('inserts a live row as synced and counts it', async () => {
    expect(await weight.applyRemoteWeightEntries([remote()])).toBe(1);
    expect(row('r1')).toMatchObject({ weight_kg: 80, deleted_at: null, updated_at: '2026-06-01T12:00:00.000Z' });
    expect(row('r1').synced_at).not.toBeNull();
  });

  it('returns 0 for an empty list', async () => {
    expect(await weight.applyRemoteWeightEntries([])).toBe(0);
  });

  it('a newer remote row replaces the local one', async () => {
    insert('r1', '2026-06-01', 70, { updated: '2026-06-01T12:00:00.000Z' });
    expect(await weight.applyRemoteWeightEntries([remote({ weight_kg: 81, updated_at: '2026-06-02T00:00:00+00:00' })])).toBe(1);
    expect(row('r1').weight_kg).toBe(81);
  });

  it('an older remote row is skipped and a tie keeps the local row', async () => {
    insert('r1', '2026-06-01', 70, { updated: '2026-06-05T00:00:00.000Z' });
    expect(await weight.applyRemoteWeightEntries([remote({ updated_at: '2026-06-01T00:00:00+00:00' })])).toBe(0);
    expect(await weight.applyRemoteWeightEntries([remote({ updated_at: '2026-06-05T00:00:00+00:00' })])).toBe(0);
    expect(row('r1').weight_kg).toBe(70);
  });

  it('a newer remote tombstone deletes the local row without counting it', async () => {
    insert('r1', '2026-06-01', 70, { updated: '2026-06-01T12:00:00.000Z' });
    const n = await weight.applyRemoteWeightEntries([
      remote({ deleted_at: '2026-06-03T00:00:00+00:00', updated_at: '2026-06-03T00:00:00+00:00' }),
    ]);
    expect(n).toBe(0);
    expect(row('r1')).toBeUndefined();
  });

  it('an older remote tombstone keeps the newer local row', async () => {
    insert('r1', '2026-06-01', 70, { updated: '2026-06-05T00:00:00.000Z' });
    await weight.applyRemoteWeightEntries([
      remote({ deleted_at: '2026-06-03T00:00:00+00:00', updated_at: '2026-06-03T00:00:00+00:00' }),
    ]);
    expect(row('r1').weight_kg).toBe(70);
  });

  it('a remote tombstone with no local row is skipped', async () => {
    const n = await weight.applyRemoteWeightEntries([
      remote({ deleted_at: '2026-06-03T00:00:00+00:00', updated_at: '2026-06-03T00:00:00+00:00' }),
    ]);
    expect(n).toBe(0);
    expect(count()).toBe(0);
  });
});

describe('wipe and re-sync reset', () => {
  it('clearUserData empties weight_entries, tombstones included', async () => {
    insert('a', '2026-06-01', 80);
    insert('b', '2026-06-02', 80, { deleted: '2026-06-02T13:00:00.000Z' });
    await database.clearUserData();
    expect(count()).toBe(0);
  });

  it('markAllUnsynced clears synced_at on weight rows', async () => {
    insert('a', '2026-06-01', 80, { synced: '2026-06-01T13:00:00.000Z' });
    await database.markAllUnsynced();
    expect(row('a').synced_at).toBeNull();
  });
});

describe('migration on a pre-change database', () => {
  it('creates weight_entries on an existing db and the table is usable', async () => {
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
    const cols = mem.raw.prepare('PRAGMA table_info(weight_entries)').all().map((c: any) => c.name);
    expect(cols).toEqual(
      expect.arrayContaining(['id', 'date', 'weight_kg', 'measured_at', 'created_at', 'updated_at', 'synced_at', 'deleted_at'])
    );
    expect(count()).toBe(0);
    expect((await database.getFoodLogsByDate('2026-06-01')).map((l) => l.id)).toEqual(['old']);
    await weight.saveWeightEntry({ date: '2026-06-01', weight_kg: 80 });
    expect(count()).toBe(1);
  });

  it('running the schema twice keeps existing weight rows', async () => {
    insert('a', '2026-06-01', 80);
    await weight.initWeightSchema(mem);
    expect(count()).toBe(1);
  });
});

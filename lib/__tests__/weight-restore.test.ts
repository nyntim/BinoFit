import { createMemoryDb } from '@/test-utils/sqlite-memory';

// Restore against the real weight module and an in-memory db: the profile must end up matching
// the latest entry even though the account's stored profile weight is stale.
const mockTables: Record<string, any[]> = {};
let mockProfile: { weight: number | null; height: number | null; activity_level: string | null } | null = null;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const q: any = {};
      q.select = () => q;
      q.eq = () => q;
      q.order = () => q;
      q.limit = async () => ({ data: (mockTables[table] ?? []).slice(0, 1), error: null });
      q.in = async () => ({ data: [], error: null });
      q.range = async (from: number, to: number) => ({ data: (mockTables[table] ?? []).slice(from, to + 1), error: null });
      return q;
    },
  },
}));
jest.mock('@/lib/foods-db', () => ({ getUSDAFoodById: jest.fn(async () => null) }));
jest.mock('@/lib/food-service', () => ({ lookupBarcode: jest.fn() }));
jest.mock('@/lib/reminders', () => ({ restoreMealReminders: jest.fn() }));
jest.mock('@/lib/storage', () => ({
  getUserProfile: jest.fn(async () => mockProfile),
  saveUserProfile: jest.fn(async (p: any) => {
    mockProfile = { ...p };
  }),
  applyRemoteGoals: jest.fn(async () => false),
  applyRemoteProfile: jest.fn(async (p: any) => {
    mockProfile = { weight: p.weight, height: p.height ?? null, activity_level: p.activity_level ?? null };
  }),
  setOnboardingComplete: jest.fn(async () => {}),
}));

let mem: ReturnType<typeof createMemoryDb>;
let restore: typeof import('@/lib/restore');

beforeEach(async () => {
  for (const k of Object.keys(mockTables)) delete mockTables[k];
  mockProfile = null;
  jest.resetModules();
  mem = createMemoryDb();
  const SQLite = require('expo-sqlite');
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  await require('@/lib/database').getDatabase();
  restore = require('@/lib/restore');
});

const remote = (id: string, date: string, kg: number, o: Record<string, unknown> = {}) => ({
  id,
  user_id: 'u1',
  date,
  weight_kg: kg,
  measured_at: `${date}T12:00:00+00:00`,
  created_at: `${date}T12:00:00+00:00`,
  updated_at: `${date}T12:00:00+00:00`,
  deleted_at: null,
  ...o,
});

describe('restore with weight entries', () => {
  it('profile.weight matches the latest restored entry, not the account profile', async () => {
    mockTables.user_profile = [{ weight: 99, height: 180, activity_level: 'active' }];
    mockTables.weight_entries = [remote('a', '2026-06-01', 80), remote('b', '2026-06-10', 78)];
    const res = await restore.restoreFromAccount('u1');
    expect(res).toMatchObject({ ok: true, weightEntriesRestored: 2 });
    expect(mockProfile).toMatchObject({ weight: 78, height: 180 });
  });

  it('keeps the account profile weight when the account has no weight entries', async () => {
    mockTables.user_profile = [{ weight: 99, height: 180 }];
    const res = await restore.restoreFromAccount('u1');
    expect(res).toMatchObject({ ok: true, weightEntriesRestored: 0 });
    expect(mockProfile!.weight).toBe(99);
  });

  it('a restored tombstone is not counted and its day does not set the profile', async () => {
    mockTables.weight_entries = [
      remote('a', '2026-06-01', 80),
      remote('b', '2026-06-10', 70, { deleted_at: '2026-06-11T00:00:00+00:00', updated_at: '2026-06-11T00:00:00+00:00' }),
    ];
    const res = await restore.restoreFromAccount('u1');
    expect(res).toMatchObject({ ok: true, weightEntriesRestored: 1 });
    expect(mockProfile!.weight).toBe(80);
    expect(mem.raw.prepare('SELECT COUNT(*) AS n FROM weight_entries').get()).toEqual({ n: 1 });
  });
});

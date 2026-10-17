const mockTables: Record<string, any[]> = {};
const mockRange = jest.fn();
const mockIn = jest.fn();
let mockFoodsResult: { data: any[] | null; error: any } = { data: [], error: null };
let mockFailTable: string | null = null;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const q: any = { table };
      q.select = () => q;
      q.eq = () => q;
      q.order = () => q;
      q.limit = async () => {
        if (mockFailTable === table) return { data: null, error: new Error('boom') };
        return { data: (mockTables[table] ?? []).slice(0, 1), error: null };
      };
      q.in = async (...a: unknown[]) => {
        mockIn(...a);
        return mockFoodsResult;
      };
      q.range = async (from: number, to: number) => {
        mockRange(table, from, to);
        if (mockFailTable === table) return { data: null, error: new Error('boom') };
        return { data: (mockTables[table] ?? []).slice(from, to + 1), error: null };
      };
      return q;
    },
  },
}));
jest.mock('@/lib/database', () => ({
  applyRemoteFoodLogs: jest.fn(async (rows: unknown[]) => rows.length),
  cacheRemoteFood: jest.fn(async () => {}),
  getMissingFoodIds: jest.fn(async () => []),
  replaceMealsFromRemote: jest.fn(async () => {}),
}));
jest.mock('@/lib/weight', () => ({
  applyRemoteWeightEntries: jest.fn(async (rows: unknown[]) => rows.length),
  syncProfileWeightFromLatest: jest.fn(async () => {}),
}));
jest.mock('@/lib/foods-db', () => ({ getUSDAFoodById: jest.fn(async () => null) }));
jest.mock('@/lib/food-service', () => ({ lookupBarcode: jest.fn() }));
jest.mock('@/lib/reminders', () => ({ restoreMealReminders: jest.fn() }));
jest.mock('@/lib/storage', () => ({
  applyRemoteGoals: jest.fn(async () => true),
  applyRemoteProfile: jest.fn(async () => {}),
  setOnboardingComplete: jest.fn(async () => {}),
}));

import {
  PAGE_SIZE,
  barcodeFromOffId,
  describeProgress,
  describeRestore,
  isLiveRow,
  pageRange,
  remoteFoodToFood,
  hasRestoredData,
  restoreFromAccount,
  splitFoodIds,
  uniqueFoodIds,
} from '@/lib/restore';
import * as db from '@/lib/database';
import * as storage from '@/lib/storage';
import { getUSDAFoodById } from '@/lib/foods-db';
import { lookupBarcode } from '@/lib/food-service';

const logs = (n: number, over: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) => ({ id: `log-${String(i).padStart(5, '0')}`, food_id: 'f1', ...over }));

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockTables)) delete mockTables[k];
  mockFoodsResult = { data: [], error: null };
  mockFailTable = null;
  (db.getMissingFoodIds as jest.Mock).mockResolvedValue([]);
  (getUSDAFoodById as jest.Mock).mockResolvedValue(null);
});

describe('pure helpers', () => {
  it('isLiveRow skips rows with deleted_at and passes rows without the column', () => {
    expect(isLiveRow({ deleted_at: '2026-01-01T00:00:00Z' })).toBe(false);
    expect(isLiveRow({ deleted_at: null })).toBe(true);
    expect(isLiveRow({})).toBe(true);
  });

  it('pageRange returns inclusive bounds that advance by the page size', () => {
    expect(pageRange(0)).toEqual([0, 999]);
    expect(pageRange(1000)).toEqual([1000, 1999]);
    expect(pageRange(2000, 500)).toEqual([2000, 2499]);
    expect(PAGE_SIZE).toBe(1000);
  });

  it('uniqueFoodIds de-duplicates', () => {
    expect(uniqueFoodIds([{ food_id: 'a' }, { food_id: 'b' }, { food_id: 'a' }])).toEqual(['a', 'b']);
  });

  it('splitFoodIds separates off: ids and barcodeFromOffId strips the prefix', () => {
    expect(splitFoodIds(['usda:1', 'off:0123', 'x'])).toEqual({ off: ['off:0123'], other: ['usda:1', 'x'] });
    expect(barcodeFromOffId('off:0123')).toBe('0123');
  });

  it('remoteFoodToFood fills defaults for missing numbers and rejects rows without id or name', () => {
    const f = remoteFoodToFood({ id: 'a', name: 'Apple', calories: 52, fiber: 2.4 } as never);
    expect(f).toMatchObject({ id: 'a', name: 'Apple', calories: 52, protein: 0, serving_units: '100g', source: 'branded', fiber: 2.4, sugar: null });
    expect(remoteFoodToFood({ id: '', name: 'x' } as never)).toBeNull();
    expect(remoteFoodToFood({ id: 'a', name: '' } as never)).toBeNull();
  });

  it('describeProgress and describeRestore give neutral copy', () => {
    expect(describeProgress(null)).toBe('Restoring…');
    expect(describeProgress({ stage: 'logs', fetched: 12 })).toBe('Restoring 12 entries…');
    expect(describeProgress({ stage: 'foods', done: 1, total: 4 })).toBe('Looking up foods 1 of 4…');
    expect(describeProgress({ stage: 'saving' })).toBe('Saving to this device…');
    const base = { logsRestored: 0, unresolvedFoods: 0, mealsRestored: false, goalsRestored: false, weightEntriesRestored: 0 };
    expect(describeRestore(base)).toBe('No saved data found for this account.');
    expect(describeRestore({ ...base, logsRestored: 1 })).toBe('Restored 1 entry.');
    expect(describeRestore({ ...base, goalsRestored: true })).toBe('Restored your settings.');
    expect(describeRestore({ ...base, logsRestored: 3, unresolvedFoods: 2 })).toContain('2 foods could not be found');
  });
});

describe('hasRestoredData', () => {
  const base = { logsRestored: 0, unresolvedFoods: 0, mealsRestored: false, goalsRestored: false, weightEntriesRestored: 0 };
  it.each([
    [{}, false],
    [{ mealsRestored: true }, false],
    [{ goalsRestored: true }, true],
    [{ logsRestored: 1 }, true],
    [{ goalsRestored: true, logsRestored: 3 }, true],
    [{ weightEntriesRestored: 1 }, true],
  ])('%j -> %s', (over, expected) => {
    expect(hasRestoredData({ ...base, ...over })).toBe(expected);
  });

  it('describeRestore does not say no saved data when logs came back without goals', () => {
    expect(describeRestore({ ...base, logsRestored: 4 })).toBe('Restored 4 entries.');
    expect(describeRestore({ ...base, logsRestored: 4 })).not.toContain('No saved data');
  });
});

describe('restoreFromAccount', () => {
  it('pages through 1000-row boundaries until a short page', async () => {
    mockTables.food_logs = logs(2300);
    const progress: unknown[] = [];
    const res = await restoreFromAccount('u1', (p) => progress.push(p));
    const logCalls = mockRange.mock.calls.filter((c) => c[0] === 'food_logs').map((c) => [c[1], c[2]]);
    expect(logCalls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(res).toMatchObject({ ok: true, logsRestored: 2300 });
    expect(progress).toContainEqual({ stage: 'logs', fetched: 2000 });
  });

  it('fetches one more (empty) page when the row count is an exact multiple of 1000', async () => {
    mockTables.food_logs = logs(1000);
    await restoreFromAccount('u1');
    expect(mockRange.mock.calls.filter((c) => c[0] === 'food_logs')).toHaveLength(2);
  });

  it('passes soft-deleted logs through to be applied as tombstones', async () => {
    mockTables.food_logs = [...logs(2), { id: 'dead', food_id: 'f1', deleted_at: '2026-01-01T00:00:00Z' }];
    const res = await restoreFromAccount('u1');
    const applied = (db.applyRemoteFoodLogs as jest.Mock).mock.calls[0][0];
    expect(applied.map((l: any) => l.id)).toContain('dead');
    expect(res).toMatchObject({ ok: true, logsRestored: 3 });
  });

  it('saves meals before logs so logs never point at a missing meal', async () => {
    mockTables.food_logs = logs(1);
    mockTables.meal_definitions = [{ id: 'brunch' }];
    await restoreFromAccount('u1');
    const meals = (db.replaceMealsFromRemote as jest.Mock).mock.invocationCallOrder[0];
    const lg = (db.applyRemoteFoodLogs as jest.Mock).mock.invocationCallOrder[0];
    expect(meals).toBeLessThan(lg);
  });

  it('applies goals and profile and marks onboarding complete', async () => {
    mockTables.user_goals = [{ calorie_goal: 2000, protein_goal: 1, carb_goal: 1, fat_goal: 1 }];
    mockTables.user_profile = [{ weight: 70 }];
    mockTables.meal_definitions = [{ id: 'x' }];
    const res = await restoreFromAccount('u1');
    expect(storage.applyRemoteProfile).toHaveBeenCalled();
    expect(storage.setOnboardingComplete).toHaveBeenCalled();
    expect(res).toMatchObject({ ok: true, goalsRestored: true, mealsRestored: true });
  });

  it('applies weight entries after the profile, then recomputes profile.weight from the latest entry', async () => {
    const weightMod = require('@/lib/weight');
    mockTables.user_profile = [{ weight: 70 }];
    mockTables.weight_entries = [{ id: 'w1' }, { id: 'w2', deleted_at: '2026-01-01T00:00:00Z' }];
    await restoreFromAccount('u1');
    const profileAt = (storage.applyRemoteProfile as jest.Mock).mock.invocationCallOrder[0];
    const applyAt = (weightMod.applyRemoteWeightEntries as jest.Mock).mock.invocationCallOrder[0];
    const syncAt = (weightMod.syncProfileWeightFromLatest as jest.Mock).mock.invocationCallOrder[0];
    expect(profileAt).toBeLessThan(applyAt);
    expect(applyAt).toBeLessThan(syncAt);
    // tombstones are passed through so they can delete local rows
    expect((weightMod.applyRemoteWeightEntries as jest.Mock).mock.calls[0][0].map((r: any) => r.id)).toEqual(['w1', 'w2']);
  });

  it('reports weightEntriesRestored from the apply count and 0 when the account has none', async () => {
    const weightMod = require('@/lib/weight');
    mockTables.weight_entries = [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }];
    expect(await restoreFromAccount('u1')).toMatchObject({ ok: true, weightEntriesRestored: 3 });
    delete mockTables.weight_entries;
    (weightMod.applyRemoteWeightEntries as jest.Mock).mockResolvedValueOnce(0);
    expect(await restoreFromAccount('u1')).toMatchObject({ ok: true, weightEntriesRestored: 0 });
  });

  it('treats a failed weight_entries fetch as zero rows and restores the rest', async () => {
    mockFailTable = 'weight_entries';
    mockTables.food_logs = logs(2);
    const res = await restoreFromAccount('u1');
    expect(res).toMatchObject({ ok: true, logsRestored: 2 });
  });

  it('does not mark onboarding complete when the account has no usable goals', async () => {
    (storage.applyRemoteGoals as jest.Mock).mockResolvedValueOnce(false);
    mockTables.user_goals = [{ calorie_goal: null }];
    const res = await restoreFromAccount('u1');
    expect(storage.setOnboardingComplete).not.toHaveBeenCalled();
    expect(res).toMatchObject({ ok: true, goalsRestored: false });
  });

  it('marks onboarding complete when logs came back but there are no goals', async () => {
    mockTables.food_logs = logs(2);
    const res = await restoreFromAccount('u1');
    expect(storage.setOnboardingComplete).toHaveBeenCalled();
    expect(res).toMatchObject({ ok: true, logsRestored: 2, goalsRestored: false });
  });

  it('does not mark onboarding complete when only meals came back', async () => {
    mockTables.meal_definitions = [{ id: 'x' }];
    await restoreFromAccount('u1');
    expect(storage.setOnboardingComplete).not.toHaveBeenCalled();
  });

  it('resolves foods from USDA first, then remote, and reports the rest as unresolved', async () => {
    mockTables.food_logs = logs(3);
    (db.getMissingFoodIds as jest.Mock).mockResolvedValue(['usda-1', 'remote-1', 'nowhere-1']);
    (getUSDAFoodById as jest.Mock).mockImplementation(async (id: string) =>
      id === 'usda-1' ? { id, name: 'USDA food' } : null
    );
    mockFoodsResult = { data: [{ id: 'remote-1', name: 'Remote food', calories: 10 }], error: null };

    const res = await restoreFromAccount('u1');

    expect(mockIn).toHaveBeenCalledWith('id', ['remote-1', 'nowhere-1']); // USDA hit is not asked of Supabase
    const cached = (db.cacheRemoteFood as jest.Mock).mock.calls.map((c) => c[0].id);
    expect(cached).toEqual(['usda-1', 'remote-1']);
    expect(res).toMatchObject({ ok: true, unresolvedFoods: 1 });
  });

  it('counts a failed remote food query as unresolved rather than failing the restore', async () => {
    (db.getMissingFoodIds as jest.Mock).mockResolvedValue(['a', 'b']);
    mockFoodsResult = { data: null, error: new Error('offline') };
    const res = await restoreFromAccount('u1');
    expect(res).toMatchObject({ ok: true, unresolvedFoods: 2 });
  });

  it('looks up off: ids by barcode, best-effort', async () => {
    (db.getMissingFoodIds as jest.Mock).mockResolvedValue(['off:111', 'off:222', 'off:333']);
    (lookupBarcode as jest.Mock).mockImplementation(async (code: string) =>
      code === '111'
        ? { status: 'found', food: { id: 'off:111' } }
        : code === '222'
          ? { status: 'not_found' }
          : { status: 'error' }
    );
    const res = await restoreFromAccount('u1');
    expect(lookupBarcode).toHaveBeenCalledWith('111');
    expect(lookupBarcode).toHaveBeenCalledWith('222');
    expect(mockIn).not.toHaveBeenCalled();
    expect(res).toMatchObject({ ok: true, unresolvedFoods: 2 });
  });

  it('reports a log with a missing food through unresolvedFoods and the copy mentions it', async () => {
    mockTables.food_logs = logs(1, { food_id: 'ghost' });
    (db.getMissingFoodIds as jest.Mock).mockResolvedValue(['ghost']);
    const res = await restoreFromAccount('u1');
    expect(res.ok && res.unresolvedFoods).toBe(1);
    if (res.ok) expect(describeRestore(res)).toMatch(/1 food could not be found/);
  });

  it('returns ok:false with the message and never throws when a fetch fails', async () => {
    mockFailTable = 'food_logs';
    const res = await restoreFromAccount('u1');
    expect(res).toEqual({ ok: false, error: 'boom' });
    expect(db.applyRemoteFoodLogs).not.toHaveBeenCalled();
  });
});

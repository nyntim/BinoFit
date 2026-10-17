const mockUpsert = jest.fn();
const mockFrom = jest.fn(() => ({ upsert: mockUpsert }));

jest.mock('@/lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => (mockFrom as any)(...a) } }));
jest.mock('@/lib/auth', () => ({
  getSessionUserId: jest.fn(async () => 'dev-1'),
  initAuth: jest.fn(async () => ({ status: 'none', restored: false })),
  retryPendingMergeTicket: jest.fn(async () => {}),
  reconcileSyncedUid: jest.fn(async () => {}),
}));
jest.mock('@/lib/storage', () => ({
  getUserGoals: jest.fn(async () => null),
  getUserProfile: jest.fn(async () => null),
  markGoalsSynced: jest.fn(),
  markProfileSynced: jest.fn(),
  setLastSyncAt: jest.fn(async () => {}),
}));
jest.mock('@/lib/tombstones', () => ({
  markRowsSynced: jest.fn(async () => {}),
  purgeSyncedTombstones: jest.fn(async () => {}),
}));
jest.mock('@/lib/database', () => ({
  getUnsyncedFoodLogs: jest.fn(async () => []),
  getUnsyncedMealDefinitions: jest.fn(),
  markMealDefinitionsSynced: jest.fn(),
  getUnsyncedMealNames: jest.fn(),
  markMealNamesSynced: jest.fn(),
}));

import { syncToSupabase } from '@/lib/sync';
import * as db from '@/lib/database';

const defRow = {
  id: 'lunch',
  position: 1,
  calorie_target: 500,
  protein_target: null,
  carb_target: null,
  fat_target: null,
  reminder_time: '12:30',
  created_at: 'c',
  updated_at: 'u',
  synced_at: null,
};
const nameRow = { meal_id: 'lunch', name: 'Lunch', effective_from: '0000-01-01', updated_at: 'u' };

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue({ error: null });
  (db.getUnsyncedMealDefinitions as jest.Mock).mockResolvedValue([]);
  (db.getUnsyncedMealNames as jest.Mock).mockResolvedValue([]);
});

describe('meal sync', () => {
  it('pushes unsynced definitions with user_id and marks them synced', async () => {
    (db.getUnsyncedMealDefinitions as jest.Mock).mockResolvedValue([defRow]);
    await syncToSupabase();
    expect(mockFrom).toHaveBeenCalledWith('meal_definitions');
    const [rows, opts] = mockUpsert.mock.calls[0];
    expect(rows).toEqual([
      {
        id: 'lunch',
        user_id: 'dev-1',
        position: 1,
        calorie_target: 500,
        protein_target: null,
        carb_target: null,
        fat_target: null,
        reminder_time: '12:30',
        created_at: 'c',
        updated_at: 'u',
      },
    ]);
    expect(opts).toEqual({ onConflict: 'user_id,id' });
    expect(db.markMealDefinitionsSynced).toHaveBeenCalledWith(['lunch']);
  });

  it('pushes unsynced names with user_id and marks them synced', async () => {
    (db.getUnsyncedMealNames as jest.Mock).mockResolvedValue([nameRow]);
    await syncToSupabase();
    expect(mockFrom).toHaveBeenCalledWith('meal_names');
    expect(mockUpsert.mock.calls[0][0]).toEqual([
      { user_id: 'dev-1', meal_id: 'lunch', name: 'Lunch', effective_from: '0000-01-01', updated_at: 'u' },
    ]);
    expect(mockUpsert.mock.calls[0][1]).toEqual({ onConflict: 'user_id,meal_id,effective_from' });
    expect(db.markMealNamesSynced).toHaveBeenCalledWith([nameRow]);
  });

  it('does not call Supabase when nothing is unsynced', async () => {
    await syncToSupabase();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('does not mark rows synced when the push returns an error', async () => {
    (db.getUnsyncedMealDefinitions as jest.Mock).mockResolvedValue([defRow]);
    (db.getUnsyncedMealNames as jest.Mock).mockResolvedValue([nameRow]);
    mockUpsert.mockResolvedValue({ error: { message: 'boom' } });
    await expect(syncToSupabase()).resolves.toBeUndefined();
    expect(db.markMealDefinitionsSynced).not.toHaveBeenCalled();
    expect(db.markMealNamesSynced).not.toHaveBeenCalled();
  });

  it('never throws when the push rejects', async () => {
    (db.getUnsyncedMealNames as jest.Mock).mockResolvedValue([nameRow]);
    mockUpsert.mockRejectedValue(new Error('network'));
    await expect(syncToSupabase()).resolves.toBeUndefined();
    expect(db.markMealNamesSynced).not.toHaveBeenCalled();
  });
});

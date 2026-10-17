const mockUpsert = jest.fn();
const mockFrom = jest.fn((..._a: unknown[]): { upsert: (...a: unknown[]) => unknown } => ({
  upsert: mockUpsert,
}));

jest.mock('@/lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => mockFrom(...a) } }));
jest.mock('@/lib/auth', () => ({
  getSessionUserId: jest.fn(async () => 'dev-1'),
  initAuth: jest.fn(async () => ({ status: 'none', restored: false })),
  retryPendingMergeTicket: jest.fn(async () => {}),
  reconcileSyncedUid: jest.fn(async () => {}),
}));
jest.mock('@/lib/storage', () => ({
  getUserGoals: jest.fn(),
  getUserProfile: jest.fn(),
  markGoalsSynced: jest.fn(async () => {}),
  markProfileSynced: jest.fn(async () => {}),
  setLastSyncAt: jest.fn(async () => {}),
}));
jest.mock('@/lib/tombstones', () => ({
  markRowsSynced: jest.fn(async () => {}),
  purgeSyncedTombstones: jest.fn(async () => {}),
}));
jest.mock('@/lib/weight', () => ({ getUnsyncedWeightEntries: jest.fn(async () => []) }));
jest.mock('@/lib/database', () => ({
  getUnsyncedFoodLogs: jest.fn(),
  getUnsyncedMealDefinitions: jest.fn(),
  markMealDefinitionsSynced: jest.fn(async () => {}),
  getUnsyncedMealNames: jest.fn(),
  markMealNamesSynced: jest.fn(async () => {}),
}));

jest.mock('@/lib/workouts/db', () => ({
  getUnsyncedWorkoutTree: jest.fn(async () => ({
    exercises: [],
    workouts: [],
    workoutExercises: [],
    sets: [],
  })),
  purgeSyncedExerciseTombstones: jest.fn(async () => {}),
}));

import { syncToSupabase } from '@/lib/sync';
import { getSyncState, resetSyncState } from '@/lib/sync-status';
import * as db from '@/lib/database';
import { markRowsSynced } from '@/lib/tombstones';
import * as storage from '@/lib/storage';

const log = { id: 'l1', date: '2026-01-01', meal_slot: 'lunch', food_id: 'f', serving_amount: 1, serving_unit: 'g', created_at: 'c', updated_at: 'u' };
const goals = { calorie_goal: 2000, protein_goal: 1, carb_goal: 1, fat_goal: 1, updated_at: 'u' };

beforeEach(() => {
  jest.clearAllMocks();
  resetSyncState();
  mockUpsert.mockResolvedValue({ error: null });
  (db.getUnsyncedFoodLogs as jest.Mock).mockResolvedValue([]);
  (db.getUnsyncedMealDefinitions as jest.Mock).mockResolvedValue([]);
  (db.getUnsyncedMealNames as jest.Mock).mockResolvedValue([]);
  (storage.getUserGoals as jest.Mock).mockResolvedValue(null);
  (storage.getUserProfile as jest.Mock).mockResolvedValue(null);
});

describe('sync status reporting', () => {
  it('nothing pending reports success with no network call and records lastSyncAt', async () => {
    await syncToSupabase();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(getSyncState().status).toBe('success');
    expect(getSyncState().failingSince).toBeNull();
    expect(storage.setLastSyncAt).toHaveBeenCalledTimes(1);
  });

  it('an error result from one step reports failed while other steps still mark their rows synced', async () => {
    (db.getUnsyncedFoodLogs as jest.Mock).mockResolvedValue([log]);
    (storage.getUserGoals as jest.Mock).mockResolvedValue(goals);
    mockUpsert.mockImplementation(async () => ({ error: null }));
    mockFrom.mockImplementation((table: unknown) => ({
      upsert: table === 'food_logs' ? async () => ({ error: { message: 'boom' } }) : mockUpsert,
    }));

    await expect(syncToSupabase()).resolves.toBeUndefined();

    expect(getSyncState().status).toBe('failed');
    expect(getSyncState().failingSince).not.toBeNull();
    expect(markRowsSynced).not.toHaveBeenCalled();
    expect(storage.markGoalsSynced).toHaveBeenCalledTimes(1);
    expect(storage.setLastSyncAt).not.toHaveBeenCalled();
    mockFrom.mockImplementation(() => ({ upsert: mockUpsert }));
  });

  it('a rejected upsert reports failed and the function still resolves', async () => {
    (db.getUnsyncedFoodLogs as jest.Mock).mockResolvedValue([log]);
    mockUpsert.mockRejectedValue(new Error('network down'));
    await expect(syncToSupabase()).resolves.toBeUndefined();
    expect(getSyncState().status).toBe('failed');
    expect(markRowsSynced).not.toHaveBeenCalled();
  });

  it('all steps succeeding reports success, marks rows synced and records lastSyncAt', async () => {
    (db.getUnsyncedFoodLogs as jest.Mock).mockResolvedValue([log]);
    await syncToSupabase();
    expect(markRowsSynced).toHaveBeenCalledWith('food_logs', [{ id: 'l1', updated_at: log.updated_at }]);
    expect(getSyncState().status).toBe('success');
    expect(getSyncState().lastSuccessAt).not.toBeNull();
    expect(storage.setLastSyncAt).toHaveBeenCalledTimes(1);
  });

  it('a failure to persist lastSyncAt does not make the sync fail or throw', async () => {
    (storage.setLastSyncAt as jest.Mock).mockRejectedValueOnce(new Error('disk'));
    await expect(syncToSupabase()).resolves.toBeUndefined();
    expect(getSyncState().status).toBe('success');
  });

  it('a success after a failure clears failingSince', async () => {
    (db.getUnsyncedFoodLogs as jest.Mock).mockResolvedValue([log]);
    mockUpsert.mockRejectedValueOnce(new Error('x'));
    await syncToSupabase();
    expect(getSyncState().failingSince).not.toBeNull();
    await syncToSupabase();
    expect(getSyncState().status).toBe('success');
    expect(getSyncState().failingSince).toBeNull();
  });

  it('calls made during a sync cause exactly one rerun', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    (db.getUnsyncedFoodLogs as jest.Mock).mockImplementationOnce(async () => {
      await gate;
      return [];
    });

    const first = syncToSupabase();
    await Promise.resolve();
    // Extra calls wait for the running sync, so they resolve only after the gate opens.
    const extra = [syncToSupabase(), syncToSupabase()];
    release();
    await Promise.all([first, ...extra]);

    expect(db.getUnsyncedFoodLogs).toHaveBeenCalledTimes(2);
  });

  it('a call after a sync finishes starts a fresh sync with no stale rerun', async () => {
    await syncToSupabase();
    await syncToSupabase();
    expect(db.getUnsyncedFoodLogs).toHaveBeenCalledTimes(2);
  });

  it('does not reject when a status listener throws', async () => {
    const { subscribeSyncState } = require('@/lib/sync-status');
    const unsub = subscribeSyncState(() => {
      throw new Error('boom');
    });
    await expect(syncToSupabase()).resolves.toBeUndefined();
    expect(getSyncState().status).toBe('success');
    unsub();
  });
});

const mockUpsert = jest.fn();
const mockFrom = jest.fn((..._a: unknown[]): { upsert: (...a: unknown[]) => unknown } => ({ upsert: mockUpsert }));

jest.mock('@/lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => mockFrom(...a) } }));
jest.mock('@/lib/auth', () => ({
  getSessionUserId: jest.fn(),
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
jest.mock('@/lib/tombstones', () => ({
  markRowsSynced: jest.fn(async () => {}),
  purgeSyncedTombstones: jest.fn(async () => {}),
}));
jest.mock('@/lib/database', () => ({
  getUnsyncedFoodLogs: jest.fn(async () => []),
  getUnsyncedMealDefinitions: jest.fn(async () => []),
  markMealDefinitionsSynced: jest.fn(async () => {}),
  getUnsyncedMealNames: jest.fn(async () => []),
  markMealNamesSynced: jest.fn(async () => {}),
}));

import { syncToSupabase } from '@/lib/sync';
import { getSyncState, resetSyncState } from '@/lib/sync-status';
import * as auth from '@/lib/auth';
import * as db from '@/lib/database';
import { markRowsSynced } from '@/lib/tombstones';

const log = { id: 'l1', date: '2026-01-01', meal_slot: 'lunch', food_id: 'f', serving_amount: 1, serving_unit: 'g', created_at: 'c', updated_at: 'u' };

beforeEach(() => {
  jest.clearAllMocks();
  resetSyncState();
  mockUpsert.mockResolvedValue({ error: null });
  (db.getUnsyncedFoodLogs as jest.Mock).mockResolvedValue([log]);
});

describe('sync with an auth session', () => {
  it('writes rows under the session user id', async () => {
    (auth.getSessionUserId as jest.Mock).mockResolvedValue('session-uid');
    await syncToSupabase();
    expect(mockFrom).toHaveBeenCalledWith('food_logs');
    const rows = mockUpsert.mock.calls[0][0] as { user_id: string }[];
    expect(rows[0].user_id).toBe('session-uid');
    expect(markRowsSynced).toHaveBeenCalled();
  });

  it('retries a pending merge ticket before pushing', async () => {
    (auth.getSessionUserId as jest.Mock).mockResolvedValue('session-uid');
    await syncToSupabase();
    expect(auth.retryPendingMergeTicket).toHaveBeenCalled();
  });

  it('with no session it skips, reports no failure, touches nothing and asks initAuth to retry', async () => {
    (auth.getSessionUserId as jest.Mock).mockResolvedValue(null);
    await expect(syncToSupabase()).resolves.toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(db.getUnsyncedFoodLogs).not.toHaveBeenCalled();
    expect(markRowsSynced).not.toHaveBeenCalled();
    expect(getSyncState().status).not.toBe('failed');
    expect(getSyncState().failingSince).toBeNull();
    expect(auth.initAuth).toHaveBeenCalled();
  });

  it('never rejects when the session lookup throws', async () => {
    (auth.getSessionUserId as jest.Mock).mockRejectedValue(new Error('keychain'));
    await expect(syncToSupabase()).resolves.toBeUndefined();
  });
});

describe('sync waiting and auth transitions', () => {
  const { beginAuthTransition, resetAuthTransition } = require('@/lib/auth-transition');
  beforeEach(() => {
    resetAuthTransition();
    (auth.getSessionUserId as jest.Mock).mockResolvedValue('session-uid');
  });

  it('await syncToSupabase() waits for a pass that is already running', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    (db.getUnsyncedFoodLogs as jest.Mock).mockImplementationOnce(async () => {
      await gate;
      return [];
    });
    const first = syncToSupabase();
    await Promise.resolve();
    let secondDone = false;
    const second = syncToSupabase().then(() => { secondDone = true; });
    await new Promise((r) => setTimeout(r, 10));
    expect(secondDone).toBe(false);
    release();
    await Promise.all([first, second]);
    expect(secondDone).toBe(true);
  });

  it('waitForSyncIdle resolves after the running pass', async () => {
    const { waitForSyncIdle } = require('@/lib/sync');
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    (db.getUnsyncedFoodLogs as jest.Mock).mockImplementationOnce(async () => {
      await gate;
      return [];
    });
    const run = syncToSupabase();
    let idle = false;
    const w = waitForSyncIdle().then(() => { idle = true; });
    await new Promise((r) => setTimeout(r, 10));
    expect(idle).toBe(false);
    release();
    await Promise.all([run, w]);
    expect(idle).toBe(true);
  });

  it('skips passes silently while an auth transition is held, and resumes after release', async () => {
    const release = beginAuthTransition();
    await syncToSupabase();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(getSyncState().status).toBe('idle');
    release();
    await syncToSupabase();
    expect(mockFrom).toHaveBeenCalledWith('food_logs');
  });

  it('reconciles the synced user id on each pass', async () => {
    await syncToSupabase();
    expect(auth.reconcileSyncedUid).toHaveBeenCalledWith('session-uid');
  });
});

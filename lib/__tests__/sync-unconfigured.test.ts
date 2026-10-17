jest.mock('@/lib/device-id', () => ({ getDeviceId: jest.fn(async () => 'd') }));
jest.mock('@/lib/restore', () => ({ restoreFromAccount: jest.fn() }));
jest.mock('@/lib/reminders', () => ({ restoreMealReminders: jest.fn() }));
jest.mock('@/lib/tombstones', () => ({
  markRowsSynced: jest.fn(async () => {}),
  purgeSyncedTombstones: jest.fn(async () => {}),
}));
jest.mock('@/lib/database', () => ({
  clearUserData: jest.fn(),
  getUnsyncedFoodLogs: jest.fn(async () => [{ id: 'l' }]),
  getUnsyncedMealDefinitions: jest.fn(async () => []),
  markMealDefinitionsSynced: jest.fn(),
  getUnsyncedMealNames: jest.fn(async () => []),
  markMealNamesSynced: jest.fn(),
}));

import { supabase } from '@/lib/supabase';
import { syncToSupabase } from '@/lib/sync';
import { getSyncState, resetSyncState } from '@/lib/sync-status';
import { initAuth } from '@/lib/auth';
import * as db from '@/lib/database';

const sb = supabase as any;

beforeEach(() => {
  jest.clearAllMocks();
  resetSyncState();
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
});

describe('supabase not configured', () => {
  it('initAuth makes no auth or rpc calls', async () => {
    expect(await initAuth()).toEqual({ status: 'none', restored: false });
    expect(sb.auth.getSession).not.toHaveBeenCalled();
    expect(sb.auth.signInAnonymously).not.toHaveBeenCalled();
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it('sync makes no queries, reads no local rows and reports no failure', async () => {
    await expect(syncToSupabase()).resolves.toBeUndefined();
    expect(sb.from).not.toHaveBeenCalled();
    expect(db.getUnsyncedFoodLogs).not.toHaveBeenCalled();
    expect(getSyncState().status).not.toBe('failed');
  });
});

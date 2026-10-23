const mockUpsert = jest.fn();
const mockFrom = jest.fn((..._a: unknown[]): { upsert: (...a: unknown[]) => unknown } => ({ upsert: mockUpsert }));

jest.mock('@/lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => mockFrom(...a) } }));
jest.mock('@/lib/auth', () => ({
  getSessionUserId: jest.fn(),
  initAuth: jest.fn(async () => ({ status: 'none', restored: false })),
  retryPendingMergeTicket: jest.fn(async () => {}),
  reconcileSyncedUid: jest.fn(async () => {}),
}));
jest.mock('@/lib/tombstones', () => ({
  markRowsSynced: jest.fn(async () => {}),
  purgeSyncedTombstones: jest.fn(async () => {}),
}));
jest.mock('@/lib/database', () => ({
  getUnsyncedCustomFoods: jest.fn(async () => []),
  markCustomFoodsSynced: jest.fn(async () => {}),
  getUnsyncedFoodLogs: jest.fn(async () => []),
  getUnsyncedMealDefinitions: jest.fn(async () => []),
  markMealDefinitionsSynced: jest.fn(async () => {}),
  getUnsyncedMealNames: jest.fn(async () => []),
  markMealNamesSynced: jest.fn(async () => {}),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncToSupabase } from '@/lib/sync';
import { getUserGoals, saveUserGoals, saveWeeklyVolumeTargets } from '@/lib/storage';
import { getSessionUserId } from '@/lib/auth';
const goals = { calorie_goal: 2100, protein_goal: 150, carb_goal: 200, fat_goal: 70 };
beforeEach(async () => {
  jest.clearAllMocks(); await AsyncStorage.clear();
  (getSessionUserId as jest.Mock).mockResolvedValue('u');
  mockUpsert.mockResolvedValue({ error: null });
});
test('pushes normalized targets and explicit clears', async () => {
  await saveUserGoals({ ...goals, weekly_volume_targets: { Chest: 12 } });
  await syncToSupabase();
  expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ weekly_volume_targets: { Chest: 12 } }), { onConflict: 'user_id' });
  expect((await getUserGoals())?.synced_at).toBeTruthy();
  await saveWeeklyVolumeTargets({});
  await syncToSupabase();
  expect(mockUpsert).toHaveBeenLastCalledWith(expect.objectContaining({ weekly_volume_targets: {} }), { onConflict: 'user_id' });
});
test('failed push leaves target edits unsynced', async () => {
  await saveUserGoals({ ...goals, weekly_volume_targets: { Chest: 12 } });
  mockUpsert.mockResolvedValue({ error: new Error('offline') });
  await expect(syncToSupabase()).resolves.toBeUndefined();
  expect((await getUserGoals())?.synced_at).toBeUndefined();
});
test('an edit during push retains its dirty version', async () => {
  await saveUserGoals({ ...goals, weekly_volume_targets: { Chest: 12 } });
  let release!: (value: { error: null }) => void;
  let started!: () => void;
  const pushing = new Promise<void>(resolve => { started = resolve; });
  mockUpsert.mockImplementationOnce(() => { started(); return new Promise(resolve => { release = resolve; }); });
  const sync = syncToSupabase(); await pushing;
  await saveWeeklyVolumeTargets({ Chest: 14 });
  release({ error: null }); await sync;
  expect(await getUserGoals()).toMatchObject({ weekly_volume_targets: { Chest: 14 } });
  expect((await getUserGoals())?.synced_at).toBeUndefined();
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  applyRemoteGoals,
  applyRemoteProfile,
  clearPendingMergeTicket,
  clearUserStorage,
  getDefaultLogStatus,
  getLastSyncAt,
  getLegacyClaimed,
  getOnboardingComplete,
  getPendingMergeTicket,
  getQuickAddDrinks,
  getUserGoals,
  getUserProfile,
  setDefaultLogStatus,
  setLastSyncAt,
  setLegacyClaimed,
  setOnboardingComplete,
  setPendingMergeTicket,
  saveQuickAddDrinks,
} from '@/lib/storage';

beforeEach(async () => {
  await AsyncStorage.clear();
});

const goals = { user_id: 'u', calorie_goal: 2100, protein_goal: 150, carb_goal: 200, fat_goal: 70, updated_at: '2026-03-01T10:00:00.123456+00:00' };

describe('applyRemoteGoals', () => {
  it('stores complete goals as synced with a normalised timestamp', async () => {
    expect(await applyRemoteGoals(goals as never)).toBe(true);
    const stored = await getUserGoals();
    expect(stored).toMatchObject({ calorie_goal: 2100, protein_goal: 150, carb_goal: 200, fat_goal: 70 });
    expect(stored?.updated_at).toBe('2026-03-01T10:00:00.123Z');
    expect(stored?.synced_at).toBeTruthy();
  });

  it('writes nothing and returns false when a field is null', async () => {
    expect(await applyRemoteGoals({ ...goals, fat_goal: null } as never)).toBe(false);
    expect(await getUserGoals()).toBeNull();
  });
});

describe('applyRemoteProfile', () => {
  it('stores a valid activity level', async () => {
    await applyRemoteProfile({ weight: 70, height: 175, activity_level: 'active', updated_at: '2026-03-01T00:00:00Z' } as never);
    expect(await getUserProfile()).toMatchObject({ weight: 70, height: 175, activity_level: 'active' });
  });

  it('drops an unknown activity level to null', async () => {
    await applyRemoteProfile({ weight: 70, height: 175, activity_level: 'ultra', updated_at: null } as never);
    expect((await getUserProfile())?.activity_level).toBeNull();
  });
});

describe('merge ticket and claimed flag', () => {
  it('stores and clears the pending merge ticket', async () => {
    expect(await getPendingMergeTicket()).toBeNull();
    await setPendingMergeTicket('t1', 'a1');
    expect(await getPendingMergeTicket()).toEqual({ ticket: 't1', from: 'a1' });
    await clearPendingMergeTicket();
    expect(await getPendingMergeTicket()).toBeNull();
  });

  it('defaults the legacy claimed flag to false', async () => {
    expect(await getLegacyClaimed()).toBe(false);
    await setLegacyClaimed();
    expect(await getLegacyClaimed()).toBe(true);
  });
});

describe('clearUserStorage', () => {
  it('removes user data but keeps the device id, claimed flag and default log status', async () => {
    await AsyncStorage.setItem('device_id', 'dev-123');
    await setLegacyClaimed();
    await setDefaultLogStatus('planned');
    await applyRemoteGoals(goals as never);
    await applyRemoteProfile({ weight: 70, height: 175, activity_level: 'light', updated_at: null } as never);
    await setOnboardingComplete();
    await saveQuickAddDrinks([{ id: 'd', name: 'Water', amount: 250 }]);
    await setPendingMergeTicket('t1', 'a1');
    await setLastSyncAt('2026-01-01T00:00:00.000Z');

    await clearUserStorage();

    expect(await getUserGoals()).toBeNull();
    expect(await getUserProfile()).toBeNull();
    expect(await getOnboardingComplete()).toBe(false);
    expect(await getQuickAddDrinks()).toBeNull();
    expect(await getPendingMergeTicket()).toBeNull();
    expect(await getLastSyncAt()).toBeNull();
    expect(await AsyncStorage.getItem('device_id')).toBe('dev-123');
    expect(await getLegacyClaimed()).toBe(true);
    expect(await getDefaultLogStatus()).toBe('planned');
  });
});

describe('pending wipe, restore pending and synced uid', () => {
  it('round-trips the flags', async () => {
    const s = require('@/lib/storage');
    expect(await s.getPendingWipe()).toBe(false);
    await s.setPendingWipe();
    expect(await s.getPendingWipe()).toBe(true);
    await s.clearPendingWipe();
    expect(await s.getPendingWipe()).toBe(false);
    await s.setRestorePending(true);
    expect(await s.getRestorePending()).toBe(true);
    await s.setRestorePending(false);
    expect(await s.getRestorePending()).toBe(false);
    await s.setSyncedUid('u1');
    expect(await s.getSyncedUid()).toBe('u1');
  });
});

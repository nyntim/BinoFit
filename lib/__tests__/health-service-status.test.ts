import AsyncStorage from '@react-native-async-storage/async-storage';
import AppleHealthKit from 'react-native-health';
import { beginAuthTransition } from '@/lib/auth-transition';
import { getLastHealthSyncAt, getLastHealthSyncFailed, runAppleHealthSyncPass, subscribeHealthSync } from '@/services/healthKitService';

jest.mock('@/lib/weight', () => ({ getWeightRowsForHealth: jest.fn(async () => []), applyHealthWeightPlan: jest.fn() }));
jest.mock('@/lib/health-links', () => ({ getAllHealthLinks: jest.fn(async () => []), upsertHealthLink: jest.fn(), deleteHealthLink: jest.fn() }));
jest.mock('@/lib/workouts/history', () => ({ getDoneWorkoutsForHealth: jest.fn(async () => []) }));
jest.mock('@/lib/database', () => ({ getDatabase: jest.fn(async () => ({ getAllAsync: jest.fn(async () => []) })) }));
jest.mock('@/lib/sync', () => ({ syncToSupabase: jest.fn() }));
jest.mock('@/lib/health-kit-activity', () => ({ fetchTodayActivityFromHealthKit: jest.fn(async () => ({})) }));
const hk = AppleHealthKit as any;

beforeEach(async () => {
  await AsyncStorage.clear();
  hk.isAvailable = jest.fn();
  hk.getWeightSamples = jest.fn((_options, cb) => cb(null, []));
});

it('persists successful Health sync and notifies every consumer', async () => {
  const listener = jest.fn();
  const unsubscribe = subscribeHealthSync(listener);
  expect(await runAppleHealthSyncPass()).toBe('ok');
  expect(await AsyncStorage.getItem('healthKitLastSuccessAt')).toBe(getLastHealthSyncAt()?.toISOString());
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe();
});

it('read errors report failure without advancing the prior successful timestamp', async () => {
  await runAppleHealthSyncPass();
  const previous = getLastHealthSyncAt();
  const persisted = await AsyncStorage.getItem('healthKitLastSuccessAt');
  hk.getWeightSamples = jest.fn((_options, cb) => cb('denied', null));
  expect(await runAppleHealthSyncPass()).toBe('failed');
  expect(getLastHealthSyncFailed()).toBe(true);
  expect(getLastHealthSyncAt()).toBe(previous);
  expect(await AsyncStorage.getItem('healthKitLastSuccessAt')).toBe(persisted);
});

it('coalesces duplicate manual/scheduled passes and waits behind account transitions', async () => {
  let finish!: () => void;
  hk.getWeightSamples = jest.fn((_options, cb) => { finish = () => cb(null, []); });
  const first = runAppleHealthSyncPass();
  const second = runAppleHealthSyncPass();
  expect(second).toBe(first);
  for (let attempt = 0; attempt < 10 && !finish; attempt++) await new Promise((resolve) => setImmediate(resolve));
  expect(finish).toBeDefined();
  finish();
  await first;
  const release = beginAuthTransition();
  expect(await runAppleHealthSyncPass()).toBe('init_required');
  release();
  await AsyncStorage.setItem('accountDeletionPending', 'requested');
  expect(await runAppleHealthSyncPass()).toBe('init_required');
});

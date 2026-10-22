import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getPreferences,
  loadPreferences,
  reloadPreferences,
  resetPreferences,
  setDefaultSetCount,
  setShowEffort,
  setEffortMetric,
  setRestTimerEnabled,
  setWeightUnit,
  setAppearance,
  subscribePreferences,
} from '@/lib/app-preferences';
import { clearUserStorage } from '@/lib/storage';

beforeEach(async () => {
  await AsyncStorage.clear();
  resetPreferences();
  jest.restoreAllMocks();
});

describe('app-preferences', () => {
  it('starts with defaults and loaded false', () => {
    expect(getPreferences()).toEqual({
      appearance: 'system', defaultLogStatus: 'eaten', error: null,
      weightUnit: 'lb',
      showEffort: false,
      effortMetric: 'rpe',
      restTimerEnabled: true,
      defaultSetCount: 2,
      loaded: false,
    });
  });

  it.each([null, 'invalid', 'kg', 'lb'])('hydrates %s using the saved unit or lb fallback', async (stored) => {
    if (stored !== null) await AsyncStorage.setItem('weight_unit', stored);
    await loadPreferences();
    expect(getPreferences().weightUnit).toBe(stored === 'kg' ? 'kg' : 'lb');
    expect(getPreferences().loaded).toBe(true);
    expect(await AsyncStorage.getItem('weight_unit')).toBe(stored);
  });

  it('reset restores lb then reload hydrates a saved kg preference', async () => {
    await setWeightUnit('kg');
    resetPreferences();
    expect(getPreferences().weightUnit).toBe('lb');
    expect(getPreferences().loaded).toBe(false);
    await reloadPreferences();
    expect(getPreferences().weightUnit).toBe('kg');
  });

  it('loads stored unit and effort, removes leftover tracking_mode, and marks loaded', async () => {
    await AsyncStorage.setItem('tracking_mode', 'training');
    await AsyncStorage.setItem('weight_unit', 'lb');
    await AsyncStorage.setItem('show_rpe', 'true');
    await AsyncStorage.setItem('default_set_count', '4');
    const spy = jest.spyOn(AsyncStorage, 'getItem');
    await loadPreferences();
    expect(getPreferences()).toEqual({
      appearance: 'system', defaultLogStatus: 'eaten', error: null,
      weightUnit: 'lb',
      showEffort: true,
      effortMetric: 'rpe',
      restTimerEnabled: true,
      defaultSetCount: 4,
      loaded: true,
    });
    expect(await AsyncStorage.getItem('tracking_mode')).toBeNull();
    const calls = spy.mock.calls.length;
    await loadPreferences();
    expect(spy.mock.calls.length).toBe(calls);
  });

  it('never throws when storage fails and still marks loaded', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    await expect(loadPreferences()).resolves.toBeUndefined();
    expect(getPreferences().loaded).toBe(true);
    expect(getPreferences().weightUnit).toBe('lb');
  });

  it('setters update memory, notify, and write through to storage', async () => {
    const listener = jest.fn();
    const off = subscribePreferences(listener);
    const p = setWeightUnit('lb');
    expect(getPreferences().weightUnit).toBe('lb'); // memory first
    await p;
    await setShowEffort(true);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(await AsyncStorage.getItem('weight_unit')).toBe('lb');
    expect(await AsyncStorage.getItem('show_rpe')).toBe('true');
    off();
  });

  it('setDefaultSetCount updates memory, notifies, and writes through', async () => {
    const listener = jest.fn();
    const off = subscribePreferences(listener);
    await setDefaultSetCount(3);
    expect(getPreferences().defaultSetCount).toBe(3);
    expect(await AsyncStorage.getItem('default_set_count')).toBe('3');
    expect(listener).toHaveBeenCalled();
    const calls = listener.mock.calls.length;
    await setDefaultSetCount(0);
    await setDefaultSetCount(11);
    expect(getPreferences().defaultSetCount).toBe(3);
    expect(await AsyncStorage.getItem('default_set_count')).toBe('3');
    expect(listener.mock.calls.length).toBe(calls);
    off();
  });

  it('unsubscribe stops notifications and a throwing listener does not block others', async () => {
    const bad = jest.fn(() => {
      throw new Error('boom');
    });
    const good = jest.fn();
    const offBad = subscribePreferences(bad);
    const off = subscribePreferences(good);
    await setShowEffort(true);
    expect(good).toHaveBeenCalledTimes(1);
    off();
    offBad();
    await setShowEffort(false);
    expect(good).toHaveBeenCalledTimes(1);
  });

  it.each(['kg', 'lb'] as const)('reload after a wipe keeps saved %s, effort, rest timer and default sets', async (unit) => {
    await loadPreferences();
    await setWeightUnit(unit);
    await setShowEffort(true);
    await setEffortMetric('rir');
    await setRestTimerEnabled(false);
    await setDefaultSetCount(4);
    await clearUserStorage();
    await reloadPreferences();
    expect(getPreferences()).toEqual({
      appearance: 'system', defaultLogStatus: 'eaten', error: null,
      weightUnit: unit,
      showEffort: true,
      effortMetric: 'rir',
      restTimerEnabled: false,
      defaultSetCount: 4,
      loaded: true,
    });
  });
});


test('rapid appearance writes persist in selection order and survive reload', async () => {
  await Promise.all([setAppearance('dark'), setAppearance('light'), setAppearance('system')]);
  expect(await AsyncStorage.getItem('appearance')).toBe('system');
  await reloadPreferences();
  expect(getPreferences().appearance).toBe('system');
});
test('failed preference save reports failure and retains the persisted selection', async () => {
  await setAppearance('dark');
  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk'));
  await expect(setAppearance('light')).rejects.toThrow('disk');
  expect(getPreferences().appearance).toBe('dark');
  expect(getPreferences().error).toMatch(/save preferences/);
});
test('appearance remains saved across user storage clearing', async () => {
  await setAppearance('dark');
  await clearUserStorage();
  await reloadPreferences();
  expect(getPreferences().appearance).toBe('dark');
});

test('existing show_rpe loads as showEffort, invalid effort_metric falls back to rpe, only false disables rest', async () => {
  await AsyncStorage.setItem('show_rpe', 'true');
  await AsyncStorage.setItem('effort_metric', 'bogus');
  await AsyncStorage.setItem('rest_timer_enabled', 'nope');
  await loadPreferences();
  expect(getPreferences()).toMatchObject({ showEffort: true, effortMetric: 'rpe', restTimerEnabled: true });
});
test('effort scale and rest timer switch write through and roll back on failure', async () => {
  await setEffortMetric('rir');
  await setRestTimerEnabled(false);
  expect(await AsyncStorage.getItem('effort_metric')).toBe('rir');
  expect(await AsyncStorage.getItem('rest_timer_enabled')).toBe('false');
  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk'));
  await expect(setRestTimerEnabled(true)).rejects.toThrow('disk');
  expect(getPreferences().restTimerEnabled).toBe(false);
});


test('effort None preserves the saved scale, and ordered selections persist the last mode', async () => {
  const { setEffortMode } = require('@/lib/app-preferences');
  await setEffortMetric('rir');
  const writes = jest.spyOn(AsyncStorage, 'setItem');
  writes.mockClear();
  await setEffortMode('none');
  expect(writes.mock.calls).toEqual([['show_rpe', 'false']]);
  expect(getPreferences()).toMatchObject({ showEffort: false, effortMetric: 'rir' });
  await Promise.all([setEffortMode('rir'), setEffortMode('none'), setEffortMode('rpe')]);
  await reloadPreferences();
  expect(getPreferences()).toMatchObject({ showEffort: true, effortMetric: 'rpe' });
});
test('a failed effort scale write never enables effort and the next selection can succeed', async () => {
  const { setEffortMode } = require('@/lib/app-preferences');
  await loadPreferences();
  const writes = jest.spyOn(AsyncStorage, 'setItem').mockClear().mockRejectedValueOnce(new Error('disk'));
  await expect(setEffortMode('rir')).rejects.toThrow('disk');
  expect(writes.mock.calls).toEqual([['effort_metric', 'rir']]);
  expect(getPreferences()).toMatchObject({ showEffort: false, effortMetric: 'rpe' });
  expect(getPreferences().error).toMatch(/save preferences/);
  await setEffortMode('rir');
  expect(getPreferences()).toMatchObject({ showEffort: true, effortMetric: 'rir', error: null });
});
test('food default writes serialize, reload, and roll back failed changes', async () => {
  const { setDefaultLogStatus } = require('@/lib/app-preferences');
  await Promise.all([setDefaultLogStatus('planned'), setDefaultLogStatus('eaten'), setDefaultLogStatus('planned')]);
  await reloadPreferences();
  expect(getPreferences().defaultLogStatus).toBe('planned');
  expect(await AsyncStorage.getItem('default_log_status')).toBe('planned');
  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk'));
  await expect(setDefaultLogStatus('eaten')).rejects.toThrow('disk');
  expect(getPreferences().defaultLogStatus).toBe('planned');
});

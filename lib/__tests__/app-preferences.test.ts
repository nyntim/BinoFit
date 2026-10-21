import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getPreferences,
  loadPreferences,
  reloadPreferences,
  resetPreferences,
  setDefaultSetCount,
  setShowRpe,
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
      showRpe: false,
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

  it('loads stored unit and RPE, removes leftover tracking_mode, and marks loaded', async () => {
    await AsyncStorage.setItem('tracking_mode', 'training');
    await AsyncStorage.setItem('weight_unit', 'lb');
    await AsyncStorage.setItem('show_rpe', 'true');
    await AsyncStorage.setItem('default_set_count', '4');
    const spy = jest.spyOn(AsyncStorage, 'getItem');
    await loadPreferences();
    expect(getPreferences()).toEqual({
      appearance: 'system', defaultLogStatus: 'eaten', error: null,
      weightUnit: 'lb',
      showRpe: true,
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
    await setShowRpe(true);
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
    await setShowRpe(true);
    expect(good).toHaveBeenCalledTimes(1);
    off();
    offBad();
    await setShowRpe(false);
    expect(good).toHaveBeenCalledTimes(1);
  });

  it.each(['kg', 'lb'] as const)('reload after a wipe keeps saved %s, RPE and default sets', async (unit) => {
    await loadPreferences();
    await setWeightUnit(unit);
    await setShowRpe(true);
    await setDefaultSetCount(4);
    await clearUserStorage();
    await reloadPreferences();
    expect(getPreferences()).toEqual({
      appearance: 'system', defaultLogStatus: 'eaten', error: null,
      weightUnit: unit,
      showRpe: true,
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

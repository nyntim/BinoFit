import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getPreferences,
  loadPreferences,
  reloadPreferences,
  resetPreferences,
  setShowRpe,
  setTrackingMode,
  setWeightUnit,
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
    expect(getPreferences()).toEqual({ trackingMode: 'both', weightUnit: 'kg', showRpe: false, loaded: false });
  });

  it('loads stored values once and marks loaded', async () => {
    await AsyncStorage.setItem('tracking_mode', 'training');
    await AsyncStorage.setItem('weight_unit', 'lb');
    await AsyncStorage.setItem('show_rpe', 'true');
    const spy = jest.spyOn(AsyncStorage, 'getItem');
    await loadPreferences();
    expect(getPreferences()).toEqual({ trackingMode: 'training', weightUnit: 'lb', showRpe: true, loaded: true });
    const calls = spy.mock.calls.length;
    await loadPreferences();
    expect(spy.mock.calls.length).toBe(calls);
  });

  it('never throws when storage fails and still marks loaded', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    await expect(loadPreferences()).resolves.toBeUndefined();
    expect(getPreferences().loaded).toBe(true);
    expect(getPreferences().weightUnit).toBe('kg');
  });

  it('setters update memory, notify, and write through to storage', async () => {
    const listener = jest.fn();
    const off = subscribePreferences(listener);
    const p = setWeightUnit('lb');
    expect(getPreferences().weightUnit).toBe('lb'); // memory first
    await p;
    await setTrackingMode('nutrition');
    await setShowRpe(true);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(await AsyncStorage.getItem('weight_unit')).toBe('lb');
    expect(await AsyncStorage.getItem('tracking_mode')).toBe('nutrition');
    expect(await AsyncStorage.getItem('show_rpe')).toBe('true');
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

  it('reload after a wipe resets mode but keeps unit and RPE', async () => {
    await loadPreferences();
    await setTrackingMode('training');
    await setWeightUnit('lb');
    await setShowRpe(true);
    await clearUserStorage();
    expect(getPreferences().trackingMode).toBe('training'); // stale until reload
    await reloadPreferences();
    expect(getPreferences()).toEqual({ trackingMode: 'both', weightUnit: 'lb', showRpe: true, loaded: true });
  });
});

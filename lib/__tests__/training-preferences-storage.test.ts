import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearUserStorage,
  getActiveRestTimer,
  getDefaultSetCount,
  getShowRpe,
  getWeightUnit,
  parseRestTimer,
  resolveDefaultSetCount,
  resolveWeightUnit,
  resetOnboarding,
  setActiveRestTimer,
  setDefaultSetCount,
  setShowRpe,
  setWeightUnit,
} from '@/lib/storage';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('training preference storage', () => {
  it.each([null, '', 'stone'])('absent or invalid unit %s defaults to lb without writing it', async (stored) => {
    if (stored !== null) await AsyncStorage.setItem('weight_unit', stored);
    expect(resolveWeightUnit(stored)).toBe('lb');
    expect(await getWeightUnit()).toBe('lb');
    expect(await AsyncStorage.getItem('weight_unit')).toBe(stored || null);
  });

  it.each(['kg', 'lb'] as const)('saved %s round trips and survives onboarding reset and user clear', async (unit) => {
    await setWeightUnit(unit);
    expect(await getWeightUnit()).toBe(unit);
    await resetOnboarding();
    expect(await getWeightUnit()).toBe(unit);
    await clearUserStorage();
    expect(await getWeightUnit()).toBe(unit);
  });

  it('show RPE defaults to false and round trips', async () => {
    expect(await getShowRpe()).toBe(false);
    await setShowRpe(true);
    expect(await getShowRpe()).toBe(true);
    await setShowRpe(false);
    expect(await getShowRpe()).toBe(false);
  });

  it('rest timer round trips and null clears it', async () => {
    const t = { workoutId: 'w1', endsAt: 1000, durationSeconds: 90 };
    await setActiveRestTimer(t);
    expect(await getActiveRestTimer()).toEqual(t);
    await setActiveRestTimer(null);
    expect(await getActiveRestTimer()).toBeNull();
  });

  it('parseRestTimer rejects malformed input', () => {
    expect(parseRestTimer(null)).toBeNull();
    expect(parseRestTimer('{not json')).toBeNull();
    expect(parseRestTimer('{"workoutId":1,"endsAt":2,"durationSeconds":3}')).toBeNull();
    expect(parseRestTimer('{"workoutId":"a","endsAt":"2","durationSeconds":3}')).toBeNull();
  });

  it('resolveDefaultSetCount matches prefill rules', () => {
    expect(resolveDefaultSetCount('3')).toBe(3);
    expect(resolveDefaultSetCount('99')).toBe(2);
  });

  it('default set count defaults to 2 and round trips', async () => {
    expect(await getDefaultSetCount()).toBe(2);
    await setDefaultSetCount(4);
    expect(await getDefaultSetCount()).toBe(4);
  });

  it('clearUserStorage keeps unit, RPE and default sets but clears rest timer', async () => {
    await setWeightUnit('lb');
    await setShowRpe(true);
    await setDefaultSetCount(4);
    await AsyncStorage.setItem('tracking_mode', 'training');
    await setActiveRestTimer({ workoutId: 'w', endsAt: 5, durationSeconds: 60 });
    await clearUserStorage();
    expect(await getWeightUnit()).toBe('lb');
    expect(await getShowRpe()).toBe(true);
    expect(await getDefaultSetCount()).toBe(4);
    expect(await AsyncStorage.getItem('tracking_mode')).toBe('training');
    expect(await getActiveRestTimer()).toBeNull();
  });
});

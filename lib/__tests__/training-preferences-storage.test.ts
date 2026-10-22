import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearUserStorage,
  getActiveRestTimer,
  getDefaultSetCount,
  getEffortMetric,
  getRestTimerEnabled,
  resolveEffortMetric,
  setEffortMetric,
  setRestTimerEnabled,
  getShowEffort,
  getWeightUnit,
  parseRestTimer,
  resolveDefaultSetCount,
  resolveWeightUnit,
  resetOnboarding,
  setActiveRestTimer,
  setDefaultSetCount,
  setShowEffort,
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

  it('show effort defaults to false and round trips', async () => {
    expect(await getShowEffort()).toBe(false);
    await setShowEffort(true);
    expect(await getShowEffort()).toBe(true);
    await setShowEffort(false);
    expect(await getShowEffort()).toBe(false);
  });

  it('effort metric defaults to rpe, resolves invalid values to rpe and round trips', async () => {
    expect(await getEffortMetric()).toBe('rpe');
    expect(resolveEffortMetric('bogus')).toBe('rpe');
    await setEffortMetric('rir');
    expect(await getEffortMetric()).toBe('rir');
  });

  it('rest timer switch defaults on and only the string false turns it off', async () => {
    expect(await getRestTimerEnabled()).toBe(true);
    await AsyncStorage.setItem('rest_timer_enabled', 'garbage');
    expect(await getRestTimerEnabled()).toBe(true);
    await setRestTimerEnabled(false);
    expect(await getRestTimerEnabled()).toBe(false);
    await setRestTimerEnabled(true);
    expect(await getRestTimerEnabled()).toBe(true);
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

  it('clearUserStorage keeps unit, effort, rest timer switch and default sets but clears rest timer', async () => {
    await setWeightUnit('lb');
    await setShowEffort(true);
    await setEffortMetric('rir');
    await setRestTimerEnabled(false);
    await setDefaultSetCount(4);
    await AsyncStorage.setItem('tracking_mode', 'training');
    await setActiveRestTimer({ workoutId: 'w', endsAt: 5, durationSeconds: 60 });
    await clearUserStorage();
    expect(await getWeightUnit()).toBe('lb');
    expect(await getShowEffort()).toBe(true);
    expect(await getEffortMetric()).toBe('rir');
    expect(await getRestTimerEnabled()).toBe(false);
    expect(await getDefaultSetCount()).toBe(4);
    expect(await AsyncStorage.getItem('tracking_mode')).toBe('training');
    expect(await getActiveRestTimer()).toBeNull();
  });
});

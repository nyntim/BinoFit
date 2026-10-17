import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearUserStorage,
  getActiveRestTimer,
  getShowRpe,
  getWeightUnit,
  parseRestTimer,
  resolveWeightUnit,
  setActiveRestTimer,
  setShowRpe,
  setWeightUnit,
} from '@/lib/storage';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('training preference storage', () => {
  it('weight unit defaults to kg and round trips lb', async () => {
    expect(await getWeightUnit()).toBe('kg');
    expect(resolveWeightUnit('stone')).toBe('kg');
    await setWeightUnit('lb');
    expect(await getWeightUnit()).toBe('lb');
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

  it('clearUserStorage keeps unit and RPE but clears rest timer', async () => {
    await setWeightUnit('lb');
    await setShowRpe(true);
    await AsyncStorage.setItem('tracking_mode', 'training');
    await setActiveRestTimer({ workoutId: 'w', endsAt: 5, durationSeconds: 60 });
    await clearUserStorage();
    expect(await getWeightUnit()).toBe('lb');
    expect(await getShowRpe()).toBe(true);
    expect(await AsyncStorage.getItem('tracking_mode')).toBe('training');
    expect(await getActiveRestTimer()).toBeNull();
  });
});

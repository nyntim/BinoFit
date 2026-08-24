import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getUserGoals,
  saveUserGoals,
  markGoalsSynced,
  getRequirePlanMode,
  setRequirePlanMode,
  getQuickAddDrinks,
  saveQuickAddDrinks,
} from '@/lib/storage';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('user goals', () => {
  it('returns null when nothing has been saved', async () => {
    expect(await getUserGoals()).toBeNull();
  });

  it('round-trips saved goals with a fresh updated_at and no synced_at', async () => {
    await saveUserGoals({ calorie_goal: 2000, protein_goal: 150, carb_goal: 200, fat_goal: 65 });

    const goals = await getUserGoals();
    expect(goals).toMatchObject({ calorie_goal: 2000, protein_goal: 150, carb_goal: 200, fat_goal: 65 });
    expect(goals?.updated_at).toEqual(expect.any(String));
    expect(goals?.synced_at).toBeUndefined();
  });

  it('marks existing goals synced without touching other fields', async () => {
    await saveUserGoals({ calorie_goal: 2000, protein_goal: 150, carb_goal: 200, fat_goal: 65 });
    await markGoalsSynced('2026-01-01T00:00:00.000Z');

    const goals = await getUserGoals();
    expect(goals?.synced_at).toBe('2026-01-01T00:00:00.000Z');
    expect(goals?.calorie_goal).toBe(2000);
  });

  it('is a no-op when marking sync with no goals saved', async () => {
    await markGoalsSynced('2026-01-01T00:00:00.000Z');
    expect(await getUserGoals()).toBeNull();
  });
});

describe('plan mode preference', () => {
  it('defaults to false when unset', async () => {
    expect(await getRequirePlanMode()).toBe(false);
  });

  it('round-trips true and false', async () => {
    await setRequirePlanMode(true);
    expect(await getRequirePlanMode()).toBe(true);

    await setRequirePlanMode(false);
    expect(await getRequirePlanMode()).toBe(false);
  });
});

describe('quick add drinks', () => {
  it('returns null when nothing has been saved', async () => {
    expect(await getQuickAddDrinks()).toBeNull();
  });

  it('round-trips a saved list', async () => {
    const drinks = [{ id: '1', name: 'Water', amount: 250 }];
    await saveQuickAddDrinks(drinks);
    expect(await getQuickAddDrinks()).toEqual(drinks);
  });
});

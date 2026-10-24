import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useDaySummary } from '@/hooks/useDaySummary';
import { getFoodLogsWithFoodByDate, getMealSlotConfirmationsByDate } from '@/lib/database';
import { getDoneWorkoutsBetween } from '@/lib/workouts/history';

jest.mock('@/hooks/usePreferences', () => ({ usePreferences: () => ({ weightUnit: 'kg' }) }));
jest.mock('@/lib/database', () => ({ getFoodLogsWithFoodByDate: jest.fn(), getMealSlotConfirmationsByDate: jest.fn() }));
jest.mock('@/lib/workouts/history', () => ({ getDoneWorkoutsBetween: jest.fn() }));
jest.mock('@/lib/workouts/summary', () => ({ summarizeWorkout: (w: { id: string }) => ({ id: w.id, title: w.id }) }));

const foodRead = getFoodLogsWithFoodByDate as jest.Mock;
const confirmations = getMealSlotConfirmationsByDate as jest.Mock;
const workoutRead = getDoneWorkoutsBetween as jest.Mock;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};
const log = (calories: number, serving = 1) => ({ meal_slot: 'lunch', serving_amount: serving, food_calories: calories, food_protein: 0, food_carbs: 0, food_fat: 0 });

beforeEach(() => {
  jest.clearAllMocks();
  foodRead.mockResolvedValue([log(500, 2)]);
  confirmations.mockResolvedValue([]);
  workoutRead.mockResolvedValue([]);
});

test('reports rounded eaten calories and the day workouts', async () => {
  workoutRead.mockResolvedValue([{ id: 'w1' }]);
  const { result } = await renderHook(() => useDaySummary('2026-10-20'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.eatenCalories).toBe(1000);
  expect(result.current.workouts).toEqual([{ id: 'w1', title: 'w1' }]);
  expect(workoutRead).toHaveBeenCalledWith('2026-10-20', '2026-10-20');
});

test('planned meals are left out of the eaten calories', async () => {
  confirmations.mockResolvedValue([{ meal_slot: 'lunch', confirmed: false }]);
  const { result } = await renderHook(() => useDaySummary('2026-10-20'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.eatenCalories).toBe(0);
});

test('a stale date response is ignored', async () => {
  const first = deferred<unknown[]>();
  foodRead.mockImplementation((date: string) => (date === '2026-10-20' ? first.promise : Promise.resolve([log(300)])));
  const { result, rerender } = await renderHook(({ date }: { date: string }) => useDaySummary(date), { initialProps: { date: '2026-10-20' } });
  await rerender({ date: '2026-10-21' });
  await waitFor(() => expect(result.current.eatenCalories).toBe(300));
  await act(async () => first.resolve([log(900)]));
  expect(result.current.eatenCalories).toBe(300);
});

test('a food failure gives null calories while workouts still load', async () => {
  foodRead.mockRejectedValue(new Error('db'));
  workoutRead.mockResolvedValue([{ id: 'w1' }]);
  const { result } = await renderHook(() => useDaySummary('2026-10-20'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.eatenCalories).toBeNull();
  expect(result.current.workouts).toHaveLength(1);
});

test('a workout failure gives an empty list while the calories still load', async () => {
  workoutRead.mockRejectedValue(new Error('db'));
  const { result } = await renderHook(() => useDaySummary('2026-10-20'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.eatenCalories).toBe(1000);
  expect(result.current.workouts).toEqual([]);
});

test('a future date skips the workout read', async () => {
  const { result } = await renderHook(() => useDaySummary('2999-01-01'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(workoutRead).not.toHaveBeenCalled();
  expect(result.current.workouts).toEqual([]);
});

test('a null date reads nothing', async () => {
  const { result } = await renderHook(() => useDaySummary(null));
  expect(foodRead).not.toHaveBeenCalled();
  expect(workoutRead).not.toHaveBeenCalled();
  expect(result.current).toEqual({ eatenCalories: null, workouts: [], loading: false });
});

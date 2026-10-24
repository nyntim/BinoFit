import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useTrainingOverview } from '@/hooks/useTrainingOverview';
import { getUserGoals } from '@/lib/storage';
import { getDoneWorkoutsBetween, getRecentDoneWorkouts } from '@/lib/workouts/history';
import { getWorkoutRecordCounts } from '@/lib/workouts/record-history';
import { getWorkoutWithExercises } from '@/lib/workouts/db';
let mockFocus: () => void;
let mockNow = new Date(2026, 9, 25, 23, 59).getTime();
jest.mock('expo-router', () => ({ useIsFocused: () => true, useFocusEffect: (fn: () => void) => { mockFocus = fn; jest.requireActual<typeof import('react')>('react').useEffect(fn, [fn]); } }));
jest.mock('@/hooks/useNow', () => ({ useNow: () => mockNow }));
jest.mock('@/hooks/usePreferences', () => ({ usePreferences: () => ({ weightUnit: 'kg' }) }));
let mockActive: { id: string } | null = null;
jest.mock('@/hooks/useActiveWorkout', () => ({ useActiveWorkout: () => ({ workout: mockActive }) }));
jest.mock('@/lib/workouts/record-history', () => ({ getWorkoutRecordCounts: jest.fn(async () => new Map()) }));
jest.mock('@/lib/workouts/db', () => ({ getWorkoutWithExercises: jest.fn() }));
jest.mock('@/lib/storage', () => ({ getUserGoals: jest.fn() }));
jest.mock('@/lib/workouts/history', () => ({ getDoneWorkoutsBetween: jest.fn(), getRecentDoneWorkouts: jest.fn(async () => []) }));
beforeEach(() => {
  jest.clearAllMocks(); jest.useFakeTimers();
  mockActive = null;
  (getRecentDoneWorkouts as jest.Mock).mockResolvedValue([]);
  (getWorkoutRecordCounts as jest.Mock).mockResolvedValue(new Map());
  mockNow = new Date(2026, 9, 25, 23, 59).getTime(); jest.setSystemTime(mockNow);
  (getDoneWorkoutsBetween as jest.Mock).mockResolvedValue([]);
  (getUserGoals as jest.Mock).mockResolvedValue({ weekly_volume_targets: { Chest: 12 } });
});
afterEach(() => jest.useRealTimers());
test('focus refreshes goals and an old pending goal read cannot replace newer targets', async () => {
  const { result } = await renderHook(() => useTrainingOverview());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.muscleSets).toEqual([{ region: 'Chest', sets: 0, target: 12, status: 'under' }]);
  let release!: (goals: unknown) => void;
  (getUserGoals as jest.Mock).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
  await act(() => mockFocus());
  (getUserGoals as jest.Mock).mockResolvedValue({ weekly_volume_targets: { Lats: 10 } });
  await act(() => mockFocus());
  await waitFor(() => expect(result.current.muscleSets[0].region).toBe('Lats'));
  await act(() => release({ weekly_volume_targets: { Chest: 12 } }));
  expect(result.current.muscleSets[0].region).toBe('Lats');
});
test('Monday rollover reloads goals and preserves targeted zero rows', async () => {
  const { result, rerender } = await renderHook(() => useTrainingOverview());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(getDoneWorkoutsBetween).toHaveBeenCalledWith('2026-10-19', '2026-10-25');
  mockNow = new Date(2026, 9, 26, 0, 1).getTime(); jest.setSystemTime(mockNow);
  await rerender(undefined);
  await waitFor(() => expect(getDoneWorkoutsBetween).toHaveBeenCalledWith('2026-10-26', '2026-11-01'));
  expect(result.current.muscleSets[0]).toMatchObject({ region: 'Chest', sets: 0, target: 12 });
  expect(getUserGoals).toHaveBeenCalledTimes(2);
});

test('exposes done dates, record counts and active progress', async () => {
  mockActive = { id: 'a1' };
  (getDoneWorkoutsBetween as jest.Mock).mockResolvedValue([{ date: '2026-10-20', exercises: [] }, { date: '2026-10-22', exercises: [] }]);
  (getWorkoutRecordCounts as jest.Mock).mockResolvedValue(new Map([['w1', 2]]));
  (getWorkoutWithExercises as jest.Mock).mockResolvedValue({
    exercises: [{ sets: [{ completed_at: 'x' }, { completed_at: null }] }],
  });
  const { result } = await renderHook(() => useTrainingOverview());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.doneDates).toEqual(['2026-10-20', '2026-10-22']);
  expect(result.current.recordCounts.get('w1')).toBe(2);
  expect(result.current.activeProgress).toEqual({ done: 1, total: 2 });
});

test('a failing record count or progress read leaves the overview ready', async () => {
  mockActive = { id: 'a1' };
  (getWorkoutRecordCounts as jest.Mock).mockRejectedValue(new Error('db'));
  (getWorkoutWithExercises as jest.Mock).mockRejectedValue(new Error('db'));
  const { result } = await renderHook(() => useTrainingOverview());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.recordCounts.size).toBe(0);
  expect(result.current.activeProgress).toBeNull();
});

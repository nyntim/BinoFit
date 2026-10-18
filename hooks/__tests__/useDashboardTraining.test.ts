import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useDashboardTraining } from '@/hooks/useDashboardTraining';
import { getDoneWorkoutDates, getDoneWorkoutsBetween } from '@/lib/workouts/history';

jest.mock('expo-router', () => ({ useIsFocused: () => true, useFocusEffect: (fn: () => () => void) => jest.requireActual<typeof import('react')>('react').useEffect(fn, [fn]) }));
let mockNow = new Date(2026, 9, 17, 12).getTime();
let mockWeightUnit = 'kg';
let mockActiveId: string | null = null;
jest.mock('@/hooks/useNow', () => ({ useNow: () => mockNow }));
jest.mock('@/hooks/usePreferences', () => ({ usePreferences: () => ({ weightUnit: mockWeightUnit }) }));
jest.mock('@/hooks/useActiveWorkout', () => ({ useActiveWorkout: () => ({ workout: mockActiveId ? { id: mockActiveId } : null }) }));
jest.mock('@/lib/workouts/history', () => ({ getDoneWorkoutDates: jest.fn(), getDoneWorkoutsBetween: jest.fn() }));
jest.mock('@/lib/workouts/summary', () => ({ summarizeWorkout: (w: { id: string }) => ({ id: w.id }) }));

const dates = getDoneWorkoutDates as jest.Mock;
const between = getDoneWorkoutsBetween as jest.Mock;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};

beforeEach(() => { jest.clearAllMocks(); mockNow = new Date(2026, 9, 17, 12).getTime(); mockWeightUnit = 'kg'; mockActiveId = null; dates.mockResolvedValue([]); between.mockResolvedValue([]); });

test('loads exactly the selected local date and today bound', async () => {
  const { result } = await renderHook(() => useDashboardTraining('2026-10-16'));
  await waitFor(() => expect(result.current.dayLoading).toBe(false));
  expect(dates).toHaveBeenCalledWith('2026-10-17');
  expect(between).toHaveBeenCalledWith('2026-10-16', '2026-10-16');
});

test('old selected-day result cannot appear under a new date', async () => {
  const first = deferred<{ id: string }[]>();
  between.mockReturnValueOnce(first.promise).mockResolvedValueOnce([{ id: 'new' }]);
  const { result, rerender } = await renderHook<ReturnType<typeof useDashboardTraining>, { day: string }>(({ day }) => useDashboardTraining(day), { initialProps: { day: '2026-10-15' } });
  await rerender({ day: '2026-10-16' });
  await waitFor(() => expect(result.current.dayWorkouts.map((w) => w.id)).toEqual(['new']));
  await act(async () => first.resolve([{ id: 'old' }]));
  expect(result.current.dayWorkouts.map((w) => w.id)).toEqual(['new']);
});

test('dates survive a failed detail read and future dates skip detail', async () => {
  dates.mockResolvedValue(['2026-10-15']);
  between.mockRejectedValue(new Error('database busy'));
  const { result, rerender } = await renderHook<ReturnType<typeof useDashboardTraining>, { day: string }>(({ day }) => useDashboardTraining(day), { initialProps: { day: '2026-10-15' } });
  await waitFor(() => expect(result.current.dayError).toBe(true));
  expect(result.current.trainedDates).toEqual(['2026-10-15']);
  await rerender({ day: '2026-10-20' });
  await waitFor(() => expect(result.current.dayLoading).toBe(false));
  expect(result.current.dayWorkouts).toEqual([]);
  expect(between).toHaveBeenCalledTimes(1);
});

test('unmount invalidates a pending read', async () => {
  const pending = deferred<{ id: string }[]>();
  between.mockReturnValue(pending.promise);
  const { unmount } = await renderHook(() => useDashboardTraining('2026-10-15'));
  await unmount();
  await act(async () => pending.resolve([{ id: 'late' }]));
});

test('session and unit changes reload the selected day', async () => {
  const { rerender } = await renderHook(() => useDashboardTraining('2026-10-16'));
  expect(between).toHaveBeenCalledTimes(1);
  mockActiveId = 'active-1';
  await rerender(undefined);
  expect(between).toHaveBeenCalledTimes(2);
  mockWeightUnit = 'lb';
  await rerender(undefined);
  expect(between).toHaveBeenCalledTimes(3);
});

test('local midnight refreshes the date query boundary', async () => {
  const { result, rerender } = await renderHook(() => useDashboardTraining('2026-10-17'));
  expect(dates).toHaveBeenCalledWith('2026-10-17');
  mockNow = new Date(2026, 9, 18, 0, 1).getTime();
  await rerender(undefined);
  expect(result.current.today).toBe('2026-10-18');
  expect(dates).toHaveBeenCalledWith('2026-10-18');
});

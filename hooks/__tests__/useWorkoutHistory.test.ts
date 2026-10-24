import { act, renderHook, waitFor } from '@testing-library/react-native';
import { HISTORY_PAGE_SIZE, useWorkoutHistory } from '@/hooks/useWorkoutHistory';
import { getRecentDoneWorkouts } from '@/lib/workouts/history';
import { getWorkoutRecordCounts } from '@/lib/workouts/record-history';

jest.mock('expo-router', () => ({
  useFocusEffect: (fn: () => void) => { jest.requireActual<typeof import('react')>('react').useEffect(fn, [fn]); },
}));
jest.mock('@/hooks/usePreferences', () => ({ usePreferences: () => ({ weightUnit: 'kg' }) }));
jest.mock('@/lib/workouts/history', () => ({ getRecentDoneWorkouts: jest.fn() }));
jest.mock('@/lib/workouts/record-history', () => ({ getWorkoutRecordCounts: jest.fn() }));

const workout = (id: string) => ({ id, date: '2026-10-15', name: id, exercises: [], status: 'done', created_at: 'x' });
const page = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => workout(`${prefix}${i}`));

beforeEach(() => {
  jest.clearAllMocks();
  (getWorkoutRecordCounts as jest.Mock).mockResolvedValue(new Map());
});

test('record counts merge across pages', async () => {
  (getRecentDoneWorkouts as jest.Mock)
    .mockResolvedValueOnce(page('a', HISTORY_PAGE_SIZE))
    .mockResolvedValueOnce(page('b', 2));
  (getWorkoutRecordCounts as jest.Mock)
    .mockResolvedValueOnce(new Map([['a0', 1]]))
    .mockResolvedValueOnce(new Map([['b1', 3]]));
  const { result } = await renderHook(() => useWorkoutHistory());
  await waitFor(() => expect(result.current.recordCounts.get('a0')).toBe(1));
  await act(async () => result.current.loadMore());
  await waitFor(() => expect(result.current.recordCounts.get('b1')).toBe(3));
  expect(result.current.recordCounts.get('a0')).toBe(1);
  expect(result.current.items).toHaveLength(HISTORY_PAGE_SIZE + 2);
});

test('a failing record count leaves the list ready with no tags', async () => {
  (getRecentDoneWorkouts as jest.Mock).mockResolvedValue(page('a', 3));
  (getWorkoutRecordCounts as jest.Mock).mockRejectedValue(new Error('db'));
  const { result } = await renderHook(() => useWorkoutHistory());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.items).toHaveLength(3);
  expect(result.current.recordCounts.size).toBe(0);
});

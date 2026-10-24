import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { CalendarWidget } from '@/components/CalendarWidget';
import { getLoggedDatesInRange } from '@/lib/database';

let mockSelectedDate = '2026-10-17';
const mockSetSelectedDate = jest.fn();
jest.mock('@/context/DateContext', () => ({ useDate: () => ({ selectedDate: mockSelectedDate, setSelectedDate: mockSetSelectedDate }) }));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: (_: unknown, name: string) => name === 'cardBackground' ? '#eeeeee' : name === 'text' ? '#111111' : '#444444' }));
jest.mock('expo-router', () => ({ useFocusEffect: (fn: () => () => void) => jest.requireActual<typeof import('react')>('react').useEffect(fn, [fn]) }));
jest.mock('@/lib/database', () => ({ getLoggedDatesInRange: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));
let mockSummary: { eatenCalories: number | null; workouts: unknown[]; loading: boolean } = { eatenCalories: 1100, workouts: [], loading: false };
jest.mock('@/hooks/useDaySummary', () => ({ useDaySummary: () => mockSummary }));
jest.mock('react-native-calendars', () => ({
  Calendar: ({ current, dayComponent }: { current: string; dayComponent: (p: { date: { dateString: string } }) => React.ReactNode }) => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');
    return React.createElement(View, null, dayComponent({ date: { dateString: current.slice(0, 7) + '-15' } }));
  },
}));

const foodRead = getLoggedDatesInRange as jest.Mock;
const deferred = () => {
  let resolve!: (dates: string[]) => void;
  const promise = new Promise<string[]>((r) => { resolve = r; });
  return { promise, resolve };
};

beforeEach(() => {
  mockSelectedDate = '2026-10-17';
  mockSetSelectedDate.mockClear();
  foodRead.mockReset().mockResolvedValue([]);
  mockSummary = { eatenCalories: 1100, workouts: [], loading: false };
});

test('food, training, combined, today and empty days have distinct semantic labels', async () => {
  foodRead.mockResolvedValue(['2026-10-15', '2026-10-17', '2026-10-18']);
  await render(<CalendarWidget today="2026-10-17" trainedDates={['2026-10-16', '2026-10-17']} />);
  await waitFor(() => expect(screen.getByRole('button', { name: /Thursday, October 15, 2026, food logged/ })).toBeTruthy());
  expect(screen.getByRole('button', { name: /Friday, October 16, 2026, trained/ })).toBeTruthy();
  const today = screen.getByRole('button', { name: /Saturday, October 17, 2026, today, food logged, trained/ });
  expect(today.props.accessibilityState.selected).toBe(true);
  expect(screen.getByRole('button', { name: 'Monday, October 12, 2026' })).toBeTruthy();
  expect(screen.queryByText('Logged food')).toBeNull();
  expect(screen.queryByText('Trained')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Open month calendar' }));
  expect(screen.getByText('Logged food')).toBeTruthy();
  expect(screen.getByText('Trained')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Close calendar' }));
  expect(screen.queryByText('Logged food')).toBeNull();
  expect(screen.queryByText('Trained')).toBeNull();
});

test('week selection and month selection use full day buttons and planning limit', async () => {
  const first = await render(<CalendarWidget today="2026-10-17" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Monday, October 12, 2026' }));
  expect(mockSetSelectedDate).toHaveBeenCalledWith('2026-10-12');
  await fireEvent.press(screen.getByRole('button', { name: 'Open month calendar' }));
  expect(screen.getByText('Logged food')).toBeTruthy();
  expect(screen.queryByText('Trained')).toBeNull();
  const monthDay = screen.getAllByRole('button', { name: 'Thursday, October 15, 2026' })[1];
  expect(StyleSheet.flatten(monthDay.props.style).width).toBe(44);
  expect(StyleSheet.flatten(monthDay.props.style).minHeight).toBeGreaterThanOrEqual(44);
  mockSetSelectedDate.mockClear();
  await fireEvent.press(monthDay);
  // A month tap previews the day; Go to day applies it and closes the sheet
  expect(mockSetSelectedDate).not.toHaveBeenCalled();
  expect(screen.getByText('Thu 15 Oct')).toBeTruthy();
  expect(screen.getByText('1,100 cal eaten')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Go to day' }));
  expect(mockSetSelectedDate).toHaveBeenCalledWith('2026-10-15');
  expect(screen.queryByText('Logged food')).toBeNull();
  await first.unmount();
  mockSelectedDate = '2026-10-24';
  const { rerender } = await render(<CalendarWidget today="2026-10-17" />);
  await rerender(<CalendarWidget today="2026-10-17" />);
  expect(screen.getByRole('button', { name: 'Sunday, October 25, 2026' }).props.accessibilityState.disabled).toBe(true);
});

test('food revision reloads the selected week without navigation', async () => {
  const first = ['2026-10-15'];
  foodRead.mockResolvedValueOnce(first).mockResolvedValue([]);
  const { rerender } = await render(<CalendarWidget today="2026-10-17" foodRevision={first} />);
  await waitFor(() => expect(screen.getByRole('button', { name: /October 15, 2026, food logged/ })).toBeTruthy());
  await rerender(<CalendarWidget today="2026-10-17" foodRevision={[]} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Thursday, October 15, 2026' })).toBeTruthy());
});

test('a delayed prior month read cannot replace the visible month', async () => {
  const october = deferred();
  foodRead.mockImplementation((start: string) => start === '2026-09-28' ? october.promise : Promise.resolve(['2026-11-15']));
  await render(<CalendarWidget today="2026-11-20" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Open month calendar' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Next month' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /November 15, 2026, food logged/ })).toBeTruthy());
  october.resolve(['2026-10-15']);
  await waitFor(() => expect(screen.getByRole('button', { name: /November 15, 2026, food logged/ })).toBeTruthy());
});

test('week bounds cross years and include leap day', async () => {
  mockSelectedDate = '2024-02-29';
  const leap = await render(<CalendarWidget today="2026-10-17" />);
  expect(foodRead).toHaveBeenCalledWith('2024-02-26', '2024-03-03');
  expect(screen.getByRole('button', { name: 'Thursday, February 29, 2024' }).props.accessibilityState.selected).toBe(true);
  await leap.unmount();
  mockSelectedDate = '2026-01-01';
  await render(<CalendarWidget today="2026-10-17" />);
  expect(foodRead).toHaveBeenCalledWith('2025-12-29', '2026-01-04');
});

test('historical month uses an uncapped visible-grid range', async () => {
  mockSelectedDate = '2024-02-29';
  foodRead.mockResolvedValue(['2024-02-15']);
  await render(<CalendarWidget today="2026-10-17" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Open month calendar' }));
  await waitFor(() => expect(foodRead).toHaveBeenCalledWith('2024-01-29', '2024-03-03'));
  expect(screen.getByRole('button', { name: /February 15, 2024, food logged/ })).toBeTruthy();
});

test('next month stops at the planning limit and the summary shows a spinner while loading', async () => {
  mockSelectedDate = '2026-10-17';
  mockSummary = { eatenCalories: null, workouts: [], loading: true };
  await render(<CalendarWidget today="2026-10-17" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Open month calendar' }));
  expect(screen.getByText('October 2026')).toBeTruthy();
  expect(screen.queryByText(/cal eaten/)).toBeNull();
  // November 1 starts after today + 7, so there is nothing to go to
  expect(screen.getByRole('button', { name: 'Next month' }).props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
  expect(screen.getByText('September 2026')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Next month' }).props.accessibilityState.disabled).toBe(false);
});

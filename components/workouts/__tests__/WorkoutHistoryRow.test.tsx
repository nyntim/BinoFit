import { fireEvent, render, screen } from '@testing-library/react-native';
import { WorkoutHistoryRow } from '@/components/workouts/WorkoutHistoryRow';
import type { WorkoutSummary } from '@/lib/types';

jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: (_: unknown, key: string) => key }));
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));

const summary: WorkoutSummary = {
  id: 'a',
  date: '2026-10-15',
  title: 'Push day',
  subtitle: 'Thu 15 Oct · Bench press, Overhead press',
  durationLabel: '58 min',
  detailLabel: '12,450 kg',
  playlistLabel: null,
};

test('the default label is unchanged for compact callers', async () => {
  const onPress = jest.fn();
  await render(<WorkoutHistoryRow summary={summary} onPress={onPress} />);
  const row = screen.getByRole('button', { name: 'Push day. Thu 15 Oct · Bench press, Overhead press. 58 min. 12,450 kg' });
  await fireEvent.press(row);
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/record/)).toBeNull();
});

test('a record count shows the tag and extends the label', async () => {
  await render(<WorkoutHistoryRow summary={summary} onPress={jest.fn()} recordCount={2} />);
  expect(screen.getByText('2 records')).toBeTruthy();
  expect(screen.getByRole('button', { name: /58 min\. 12,450 kg\. 2 records$/ })).toBeTruthy();
});

test('a single record reads "1 record" and zero shows nothing', async () => {
  const view = await render(<WorkoutHistoryRow summary={summary} onPress={jest.fn()} recordCount={1} />);
  expect(screen.getByText('1 record')).toBeTruthy();
  await view.rerender(<WorkoutHistoryRow summary={summary} onPress={jest.fn()} recordCount={0} />);
  expect(screen.queryByText(/record/)).toBeNull();
});

test('the date block shows weekday and day and drops the date from the detail line', async () => {
  await render(<WorkoutHistoryRow summary={summary} onPress={jest.fn()} dateBlock />);
  expect(screen.getByText('Thu', { hidden: true })).toBeTruthy();
  expect(screen.getByText('15', { hidden: true })).toBeTruthy();
  expect(screen.getByText('Bench press, Overhead press')).toBeTruthy();
  expect(screen.queryByText('Thu 15 Oct · Bench press, Overhead press')).toBeNull();
});

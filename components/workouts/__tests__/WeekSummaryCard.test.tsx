import { render, screen } from '@testing-library/react-native';
import { WeekSummaryCard } from '@/components/workouts/WeekSummaryCard';
import { weekActivity } from '@/lib/workouts/summary';

jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: (_: unknown, key: string) => key }));

const week = { sessions: 3, volumeKg: 12450, durationSeconds: 9000 };
const range = { start: '2026-10-19', end: '2026-10-25' };

test('stats keep their accessible labels', async () => {
  await render(<WeekSummaryCard week={week} weekLabel="Mon 19 to Sun 25 Oct" unit="kg" />);
  expect(screen.getByLabelText('3 sessions')).toBeTruthy();
  expect(screen.getByLabelText('12,450 kg volume')).toBeTruthy();
  expect(screen.getByLabelText('2h 30m time')).toBeTruthy();
  expect(screen.queryByRole('image')).toBeNull();
});

test('the strip is one image with a spoken summary and a cell per day', async () => {
  const days = weekActivity(range, ['2026-10-19', '2026-10-21'], '2026-10-22', true);
  await render(<WeekSummaryCard week={week} weekLabel="Mon 19 to Sun 25 Oct" unit="kg" days={days} />);
  expect(screen.getByRole('image', { name: 'Trained Monday and Wednesday, workout in progress today' })).toBeTruthy();
  expect(screen.getAllByTestId('week-day-done', { hidden: true })).toHaveLength(2);
  expect(screen.getAllByTestId('week-day-running', { hidden: true })).toHaveLength(1);
  expect(screen.getAllByTestId('week-day-rest', { hidden: true })).toHaveLength(4);
});

import { fireEvent, render, screen } from '@testing-library/react-native';
import { DayWorkouts } from '@/components/dashboard/DayWorkouts';
import type { WorkoutSummary } from '@/lib/types';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => '#111111' }));
const workout = (id: string): WorkoutSummary => ({ id, date: '2026-10-15', title: `Workout ${id}`, subtitle: 'Thu 15 Oct', durationLabel: '40 min', detailLabel: '2,000 kg' });

beforeEach(() => mockPush.mockClear());

test('no completed workouts renders no card', async () => {
  const { toJSON } = await render(<DayWorkouts workouts={[]} />);
  expect(toJSON()).toBeNull();
});

test('each workout opens its own detail route', async () => {
  await render(<DayWorkouts workouts={[workout('a'), workout('b')]} />);
  await fireEvent.press(screen.getByRole('button', { name: /Workout a/ }));
  await fireEvent.press(screen.getByRole('button', { name: /Workout b/ }));
  expect(mockPush.mock.calls).toEqual([['/workout/a'], ['/workout/b']]);
});

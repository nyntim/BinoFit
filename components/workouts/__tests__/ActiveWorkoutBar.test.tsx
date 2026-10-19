import { fireEvent, render, screen } from '@testing-library/react-native';
import { ActiveWorkoutBar } from '@/components/workouts/ActiveWorkoutBar';

const mockPush = jest.fn();
let mockWorkout: { id: string; name: string; date: string; started_at: string } | null = null;
let mockTimer: { workoutId: string } | null = null;
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock('@/hooks/useActiveWorkout', () => ({ useActiveWorkout: () => ({ workout: mockWorkout }) }));
jest.mock('@/hooks/useRestTimer', () => ({ useRestTimer: () => ({ timer: mockTimer, remaining: 83 }) }));
jest.mock('@/hooks/useNow', () => ({ useNow: () => Date.parse('2026-10-19T12:05:00Z') }));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: (_: unknown, key: string) => key }));
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: function MockIcon() { return null; } }));

beforeEach(() => {
  mockPush.mockClear();
  mockWorkout = null;
  mockTimer = null;
});

test('native accessory opens the active session and shows rest only for that workout', async () => {
  mockWorkout = { id: 'w1', name: 'Upper', date: '2026-10-19', started_at: '2026-10-19T12:00:00Z' };
  mockTimer = { workoutId: 'w1' };
  const result = await render(<ActiveWorkoutBar nativeAccessory />);
  expect(screen.getByText('Upper')).toBeTruthy();
  expect(screen.getByText(/Rest 1:23/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Open workout' }));
  expect(mockPush).toHaveBeenCalledWith('/workout/session');
  mockTimer = { workoutId: 'other' };
  await result.rerender(<ActiveWorkoutBar nativeAccessory />);
  expect(screen.queryByText(/Rest/)).toBeNull();
  mockWorkout = null;
  await result.rerender(<ActiveWorkoutBar nativeAccessory />);
  expect(screen.queryByRole('button', { name: 'Open workout' })).toBeNull();
});

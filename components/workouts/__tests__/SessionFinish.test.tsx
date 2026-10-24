import { render, screen, userEvent } from '@testing-library/react-native';
import SessionScreen from '@/app/workout/session';
import { clearJustFinished, wasJustFinished } from '@/lib/workouts/finish-celebration';

const mockWorkout = { id: 'w1', name: 'Upper', date: '2026-10-19', started_at: '2026-10-19T12:00:00Z' };
const mockReplace = jest.fn();
let flaggedAtReplace: boolean | null = null;
jest.mock('expo-router', () => ({
  router: {
    canGoBack: () => true,
    back: jest.fn(),
    replace: (...args: unknown[]) => {
      flaggedAtReplace = require('@/lib/workouts/finish-celebration').wasJustFinished('w1');
      mockReplace(...args);
    },
  },
  useFocusEffect: () => undefined,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: (_: unknown, key: string) => key }));
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));
jest.mock('@/components/workouts/WorkoutEditor', () => ({ WorkoutEditorBody: () => null }));
jest.mock('@/hooks/useActiveWorkout', () => ({ useActiveWorkout: () => ({ loaded: true, workout: mockWorkout }) }));
jest.mock('@/hooks/useWorkoutEditor', () => ({
  useWorkoutEditor: () => ({ status: 'ready', workout: mockWorkout, flush: jest.fn().mockResolvedValue(undefined) }),
}));
jest.mock('@/hooks/useNow', () => ({ useNow: () => Date.parse('2026-10-19T12:05:00Z') }));
jest.mock('@/hooks/useRestTimer', () => ({ useRestTimer: () => ({ timer: null, remaining: 0, add: jest.fn(), subtract: jest.fn(), skip: jest.fn() }) }));
jest.mock('@/lib/workouts/active-workout-store', () => ({ refreshActiveWorkout: jest.fn() }));
let mockResult = 'finished';
jest.mock('@/lib/workouts/finish-flow', () => ({ confirmAndFinish: () => Promise.resolve(mockResult), confirmAndDiscard: jest.fn() }));
jest.mock('@/lib/workouts/rest-timer-store', () => ({ startRestTimer: jest.fn(), stopRestTimerForSet: jest.fn() }));
jest.mock('@/lib/workouts/session', () => ({ startEmptyWorkout: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  clearJustFinished('w1');
  flaggedAtReplace = null;
  mockResult = 'finished';
});

test('Finish marks the workout as just finished before navigating to it', async () => {
  await render(<SessionScreen />);
  await userEvent.press(screen.getByRole('button', { name: 'Finish workout' }));
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/workout/[id]', params: { id: 'w1' } });
  expect(flaggedAtReplace).toBe(true);
});

test('a cancelled finish does not mark the workout', async () => {
  mockResult = 'cancelled';
  await render(<SessionScreen />);
  await userEvent.press(screen.getByRole('button', { name: 'Finish workout' }));
  expect(mockReplace).not.toHaveBeenCalled();
  expect(wasJustFinished('w1')).toBe(false);
});

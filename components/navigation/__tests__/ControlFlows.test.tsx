import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { Platform } from 'react-native';
import SessionScreen from '@/app/workout/session';
import { OptionsSheet } from '@/components/workouts/OptionsSheet';
import { RestBanner } from '@/components/workouts/RestBanner';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockFinish = jest.fn();
const mockFlush = jest.fn();
const mockAdd = jest.fn();
const mockSubtract = jest.fn();
const mockSkip = jest.fn();
const mockWorkout = { id: 'w1', name: 'Upper', date: '2026-10-19', started_at: '2026-10-19T12:00:00Z' };
let mockStatus = 'ready';
let mockTimer: { exerciseName: string } | null = null;

jest.mock('expo-router', () => ({
  router: { canGoBack: () => true, back: () => mockBack(), replace: (...args: unknown[]) => mockReplace(...args) },
  useFocusEffect: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: (_: unknown, key: string) => key }));
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));
jest.mock('@/components/workouts/WorkoutEditor', () => ({ WorkoutEditorBody: () => null }));
jest.mock('@/hooks/useActiveWorkout', () => ({ useActiveWorkout: () => ({ loaded: true, workout: mockWorkout }) }));
jest.mock('@/hooks/useWorkoutEditor', () => ({
  useWorkoutEditor: () => ({ status: mockStatus, workout: mockWorkout, flush: () => mockFlush() }),
}));
jest.mock('@/hooks/useNow', () => ({ useNow: () => Date.parse('2026-10-19T12:05:00Z') }));
jest.mock('@/hooks/useRestTimer', () => ({
  useRestTimer: () => ({ timer: mockTimer, remaining: 83, add: mockAdd, subtract: mockSubtract, skip: mockSkip }),
}));
jest.mock('@/lib/workouts/active-workout-store', () => ({ refreshActiveWorkout: jest.fn() }));
jest.mock('@/lib/workouts/finish-flow', () => ({ confirmAndFinish: () => mockFinish(), confirmAndDiscard: jest.fn() }));
jest.mock('@/lib/workouts/rest-timer-store', () => ({ startRestTimer: jest.fn(), stopRestTimerForSet: jest.fn() }));
jest.mock('@/lib/workouts/session', () => ({ startEmptyWorkout: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus = 'ready';
  mockTimer = null;
  mockFlush.mockResolvedValue(undefined);
  mockFinish.mockResolvedValue('cancelled');
});
afterEach(() => jest.restoreAllMocks());

test('rest surface retains the countdown and each timer action', async () => {
  mockTimer = { exerciseName: 'Bench press' };
  const result = await render(<RestBanner />);
  expect(screen.getByRole('timer', { name: 'Rest, 1:23 left, Bench press' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Subtract 15 seconds' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Add 15 seconds' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Skip rest' }));
  expect(mockSubtract).toHaveBeenCalledTimes(1);
  expect(mockAdd).toHaveBeenCalledTimes(1);
  expect(mockSkip).toHaveBeenCalledTimes(1);
  mockTimer = null;
  await result.rerender(<RestBanner />);
  expect(screen.queryByRole('timer')).toBeNull();
});

test('options run once after iOS dismissal and Cancel does not choose an option', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const onClose = jest.fn();
  const onSelect = jest.fn();
  await render(<OptionsSheet visible onClose={onClose} options={[{ key: 'rest', label: 'Rest duration', onPress: onSelect }]} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Rest duration' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onSelect).not.toHaveBeenCalled();
  await fireEvent(screen.getByRole('button', { name: 'Cancel' }), 'dismiss');
  await fireEvent(screen.getByRole('button', { name: 'Cancel' }), 'dismiss');
  expect(onSelect).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  await fireEvent(screen.getByRole('button', { name: 'Cancel' }), 'dismiss');
  expect(onClose).toHaveBeenCalledTimes(2);
  expect(onSelect).toHaveBeenCalledTimes(1);
});

test('Finish stays disabled until the editor is ready', async () => {
  mockStatus = 'loading';
  const result = await render(<SessionScreen />);
  expect(screen.getByRole('button', { name: 'Finish workout' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));
  expect(mockFlush).not.toHaveBeenCalled();
  mockStatus = 'ready';
  await result.rerender(<SessionScreen />);
  expect(screen.getByRole('button', { name: 'Finish workout' })).toBeEnabled();
});

test('Finish prevents a second action while flushing and completing the workout', async () => {
  let finishFlush!: () => void;
  mockFlush.mockReturnValue(new Promise<void>((resolve) => { finishFlush = resolve; }));
  mockFinish.mockResolvedValue('finished');
  await render(<SessionScreen />);
  await userEvent.press(screen.getByRole('button', { name: 'Finish workout' }));
  expect(screen.getByRole('button', { name: 'Finish workout' })).toBeDisabled();
  await userEvent.press(screen.getByRole('button', { name: 'Finish workout' }));
  expect(mockFlush).toHaveBeenCalledTimes(1);
  expect(mockFinish).not.toHaveBeenCalled();
  await act(async () => { finishFlush(); });
  expect(mockFinish).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/workout/[id]', params: { id: 'w1' } });
});

test('minimize waits for pending editor writes before navigating back', async () => {
  let finishFlush!: () => void;
  mockFlush.mockReturnValue(new Promise<void>((resolve) => { finishFlush = resolve; }));
  await render(<SessionScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Minimize workout' }));
  expect(mockBack).not.toHaveBeenCalled();
  await act(async () => { finishFlush(); });
  expect(mockBack).toHaveBeenCalledTimes(1);
});

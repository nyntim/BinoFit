import { fireEvent, render, screen } from '@testing-library/react-native';
import WorkoutDetailScreen from '@/app/workout/[id]';
import { markJustFinished, wasJustFinished } from '@/lib/workouts/finish-celebration';

let mockWorkout: unknown = null;
let mockPriors: Map<string, unknown> | null = new Map();
const mockFlush = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ id: 'w1' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: (_: unknown, key: string) => key }));
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));
jest.mock('@/hooks/usePreferences', () => ({ usePreferences: () => ({ weightUnit: 'kg' }) }));
jest.mock('@/hooks/useWorkoutEditor', () => ({
  useWorkoutEditor: () => ({
    status: 'ready',
    workout: mockWorkout,
    priorRecords: mockPriors,
    flush: () => mockFlush(),
    reload: jest.fn(),
  }),
}));
jest.mock('@/components/workouts/WorkoutEditor', () => ({
  WorkoutEditorBody: ({ footer }: { footer?: React.ReactNode }) => {
    const { Text, View } = jest.requireActual('react-native');
    return <View><Text>Editor open</Text>{footer}</View>;
  },
}));
jest.mock('@/lib/sync', () => ({ syncToSupabase: jest.fn() }));
jest.mock('@/lib/workouts/db', () => ({ deleteWorkout: jest.fn() }));
jest.mock('@/lib/workouts/drafts', () => ({ cleanupEmptyEntries: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/workouts/routine-flow', () => ({ saveAsRoutineWithFeedback: jest.fn() }));

const set = (id: string, kg: number, reps: number) => ({
  id, set_type: 'normal', weight_kg: kg, reps, duration_seconds: null, distance_m: null,
  completed_at: '2026-10-15T17:30:00.000Z', position: 0,
});
const exercise = (id: string, exerciseId: string, name: string, sets: unknown[]) => ({
  id, exercise_id: exerciseId, exercise_name: name, sets,
  exercise: { id: exerciseId, name, brand: null, log_type: 'weight_reps', per_side: 0 },
});
const workoutWith = (exercises: unknown[]) => ({
  id: 'w1', name: 'Push day', date: '2026-10-15', status: 'done', playlist_id: null,
  started_at: '2026-10-15T17:00:00.000Z', created_at: '2026-10-15T17:00:00.000Z', duration_seconds: 3480, exercises,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPriors = new Map();
  mockWorkout = workoutWith([
    exercise('l1', 'bench', 'Bench press', [set('s1', 100, 5)]),
    exercise('l2', 'ohp', 'Overhead press', [set('s2', 50, 8)]),
  ]);
});

test('right after Finish a banner shows the record count', async () => {
  markJustFinished('w1');
  await render(<WorkoutDetailScreen />);
  expect(screen.getByText('Workout saved')).toBeTruthy();
  expect(screen.getByText('2 new records. Nice work.')).toBeTruthy();
});

test('a normal open shows no banner', async () => {
  await render(<WorkoutDetailScreen />);
  expect(screen.queryByText('Workout saved')).toBeNull();
  expect(screen.getByText('Push day')).toBeTruthy();
});

test('the banner has no body when no record was set', async () => {
  mockPriors = new Map([
    ['bench', { weightKg: 500, e1rmKg: 500, volumeKg: 5000, reps: 50 }],
    ['ohp', { weightKg: 500, e1rmKg: 500, volumeKg: 5000, reps: 50 }],
  ]);
  markJustFinished('w1');
  await render(<WorkoutDetailScreen />);
  expect(screen.getByText('Workout saved')).toBeTruthy();
  expect(screen.queryByText(/Nice work/)).toBeNull();
});

test('Dismiss hides the banner', async () => {
  markJustFinished('w1');
  await render(<WorkoutDetailScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByText('Workout saved')).toBeNull();
});

test('leaving clears the flag so a second mount shows nothing', async () => {
  markJustFinished('w1');
  const first = await render(<WorkoutDetailScreen />);
  expect(screen.getByText('Workout saved')).toBeTruthy();
  await first.unmount();
  expect(wasJustFinished('w1')).toBe(false);
  await render(<WorkoutDetailScreen />);
  expect(screen.queryByText('Workout saved')).toBeNull();
});

test('records show on the exercises, and Edit opens the editor until Done', async () => {
  await render(<WorkoutDetailScreen />);
  expect(screen.getAllByText('Record')).toHaveLength(2);
  expect(screen.getByLabelText('Set 1, 100 kg × 5, record, Heaviest 100 kg')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
  expect(screen.getByText('Editor open')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(await screen.findByRole('button', { name: 'Edit' })).toBeTruthy();
  expect(screen.queryByText('Editor open')).toBeNull();
});

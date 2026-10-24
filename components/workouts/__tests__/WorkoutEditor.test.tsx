import { fireEvent, render, screen } from '@testing-library/react-native';
import { WorkoutEditorBody } from '@/components/workouts/WorkoutEditor';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: (_: unknown, key: string) => key }));
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));
jest.mock('@/hooks/usePreferences', () => ({
  usePreferences: () => ({ weightUnit: 'kg', showEffort: false, effortMetric: 'rir', restTimerEnabled: true }),
}));

const set = (id: string, exId: string, done: boolean) => ({
  id, workout_id: 'w1', workout_exercise_id: exId, position: 0, set_type: 'normal', weight_kg: 50, reps: 8,
  duration_seconds: null, distance_m: null, rpe: null, rir: null, completed_at: done ? '2026-10-19T12:01:00Z' : null,
});
const ex = (id: string, name: string, sets: unknown[]) => ({
  id, exercise_id: `x-${id}`, exercise_name: name, rest_seconds: null,
  exercise: { id: `x-${id}`, name, brand: null, log_type: 'weight_reps', per_side: 0, setup_notes: null, load_type: null, base_weight_kg: null },
  sets,
});

function makeEditor() {
  return {
    workout: {
      id: 'w1', name: null, date: '2026-10-19', started_at: '2026-10-19T12:00:00Z', created_at: '2026-10-19T12:00:00Z',
      exercises: [
        ex('a', 'Bench press', [set('a1', 'a', true), set('a2', 'a', false)]),
        ex('b', 'Overhead press', [set('b1', 'b', false), set('b2', 'b', false), set('b3', 'b', false)]),
      ],
    },
    status: 'ready', writeError: false, clearWriteError: jest.fn(), previous: new Map(), priorRecords: null,
    addSet: jest.fn(), updateSet: jest.fn(), setSetType: jest.fn(), deleteSet: jest.fn(), removeExercise: jest.fn(),
    updateExercise: jest.fn(), updateMeta: jest.fn(), toggleDone: jest.fn(), flush: jest.fn(), reload: jest.fn(),
  } as never;
}

test('live mode collapses upcoming exercises and expands one on tap', async () => {
  await render(<WorkoutEditorBody editor={makeEditor()} mode="live" showMeta={false} onAddExercises={jest.fn()} />);
  expect(screen.getByText('0 of 3 sets')).toBeTruthy();
  expect(screen.queryByLabelText('Add set to Overhead press')).toBeNull();
  expect(screen.getByLabelText('Add set to Bench press')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Overhead press, 0 of 3 sets' }));
  expect(screen.getByLabelText('Add set to Overhead press')).toBeTruthy();
  expect(screen.queryByText('0 of 3 sets')).toBeNull();
});

test('edit mode never collapses exercises', async () => {
  await render(<WorkoutEditorBody editor={makeEditor()} mode="edit" showMeta={false} onAddExercises={jest.fn()} />);
  expect(screen.getByLabelText('Add set to Overhead press')).toBeTruthy();
});

test('the first unticked set of the current exercise is the only active row', async () => {
  await render(<WorkoutEditorBody editor={makeEditor()} mode="live" showMeta={false} onAddExercises={jest.fn()} />);
  // Set 2 of Bench press is next: its weight cell carries the tint border
  const cells = screen.getAllByLabelText('Set 2 weight');
  expect(cells).toHaveLength(1);
  expect(cells[0]).toHaveStyle({ borderColor: 'tint' });
  expect(screen.getByLabelText('Set 1 weight')).toHaveStyle({ borderColor: 'transparent' });
});

import { fireEvent, render, screen } from '@testing-library/react-native';
import { SetRow } from '@/components/workouts/SetRow';
import { setBadges, setColumns } from '@/lib/workouts/editor-state';
import type { WorkoutSet } from '@/lib/types';

jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: (_: unknown, key: string) => key }));
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));

const columns = setColumns('weight_reps', false, 'kg', { effort: null, showDone: true });
const makeSet = (over: Partial<WorkoutSet> = {}): WorkoutSet =>
  ({ id: 's1', workout_id: 'w', workout_exercise_id: 'we', position: 0, set_type: 'normal', weight_kg: 100, reps: 5, duration_seconds: null, distance_m: null, rpe: null, rir: null, completed_at: null, ...over }) as WorkoutSet;

function renderRow(over: { set?: WorkoutSet; personalRecord?: boolean; previousText?: string | null; onToggleDone?: () => void } = {}) {
  const set = over.set ?? makeSet();
  return render(
    <SetRow
      columns={columns}
      set={set}
      badge={setBadges([set])[0]}
      unit="kg"
      previousText={over.previousText === undefined ? '95 × 5' : over.previousText}
      previousSet={null}
      personalRecord={over.personalRecord}
      onChangeCell={jest.fn()}
      onPressBadge={jest.fn()}
      onToggleDone={over.onToggleDone ?? jest.fn()}
    />,
  );
}

test('a record set shows the ember star and extends the badge label', async () => {
  await renderRow({ personalRecord: true });
  expect(screen.getByTestId('record-star', { hidden: true })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Set 1, personal record. Change type or delete' })).toBeTruthy();
});

test('a normal set has no star and the plain badge label', async () => {
  await renderRow();
  expect(screen.queryByTestId('record-star', { hidden: true })).toBeNull();
  expect(screen.getByRole('button', { name: 'Set 1. Change type or delete' })).toBeTruthy();
});

test('the done checkbox reads Complete set 1 and toggles, then Set 1 done when checked', async () => {
  const toggle = jest.fn();
  const view = await renderRow({ onToggleDone: toggle });
  const open = screen.getByRole('checkbox', { name: 'Complete set 1' });
  expect(open).not.toBeChecked();
  await fireEvent.press(open);
  expect(toggle).toHaveBeenCalledTimes(1);
  await view.rerender(
    <SetRow
      columns={columns}
      set={makeSet({ completed_at: '2026-01-01T10:00:00.000Z' })}
      badge={setBadges([makeSet()])[0]}
      unit="kg"
      previousText="95 × 5"
      previousSet={null}
      onChangeCell={jest.fn()}
      onPressBadge={jest.fn()}
      onToggleDone={toggle}
    />,
  );
  expect(screen.getByRole('checkbox', { name: 'Set 1 done' })).toBeChecked();
});

test('shows a dash when there is no previous performance', async () => {
  await renderRow({ previousText: null });
  expect(screen.getByText('-')).toBeTruthy();
  expect(screen.queryByText('95 × 5')).toBeNull();
});

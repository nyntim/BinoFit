import { fireEvent, render, screen } from '@testing-library/react-native';
import { ExerciseSummaryCard } from '@/components/workouts/ExerciseSummaryCard';

jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: (_: unknown, key: string) => key }));

test('shows progress and the last performance', async () => {
  await render(<ExerciseSummaryCard name="Overhead press" done={0} total={3} last="115 × 8" onPress={jest.fn()} />);
  expect(screen.getByText('0 of 3 sets · last 115 × 8')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Overhead press, 0 of 3 sets, last 115 × 8' })).toBeTruthy();
});

test('leaves the last performance out when unknown', async () => {
  await render(<ExerciseSummaryCard name="Lateral raise" done={0} total={2} onPress={jest.fn()} />);
  expect(screen.getByText('0 of 2 sets')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Lateral raise, 0 of 2 sets' })).toBeTruthy();
});

test('is collapsed and expands on press', async () => {
  const onPress = jest.fn();
  await render(<ExerciseSummaryCard name="Overhead press" done={0} total={3} onPress={onPress} />);
  const button = screen.getByRole('button', { name: /Overhead press/ });
  expect(button).toBeCollapsed();
  await fireEvent.press(button);
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(screen.getAllByTestId('set-dot', { hidden: true })).toHaveLength(3);
});

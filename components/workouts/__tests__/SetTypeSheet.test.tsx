import { fireEvent, render, screen } from '@testing-library/react-native';
import { SetTypeSheet } from '@/components/workouts/SetTypeSheet';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: (_: unknown, key: string) => key }));
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));

const base = {
  visible: true,
  current: 'warmup' as const,
  title: 'Warm-up set',
  subtitle: 'Barbell bench press · 165 × 7',
  normalBadge: '3',
  onSelect: jest.fn(),
  onDelete: jest.fn(),
  onClose: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

test('lists the four set types as radios and marks the current one checked', async () => {
  await render(<SetTypeSheet {...base} />);
  expect(screen.getByLabelText('Set type')).toBeTruthy();
  expect(screen.getAllByRole('radio')).toHaveLength(4);
  expect(screen.getByRole('radio', { name: 'Warm-up' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Normal' })).not.toBeChecked();
  expect(screen.getByText('Not counted in volume or records')).toBeTruthy();
  expect(screen.getByText('Barbell bench press · 165 × 7')).toBeTruthy();
});

test('the Normal badge shows the number the set would have', async () => {
  await render(<SetTypeSheet {...base} />);
  expect(screen.getByText('3')).toBeTruthy();
  expect(screen.getByText('W')).toBeTruthy();
});

test('choosing a type selects it and closes the sheet', async () => {
  await render(<SetTypeSheet {...base} />);
  await fireEvent.press(screen.getByRole('radio', { name: 'Drop set' }));
  expect(base.onSelect).toHaveBeenCalledWith('drop');
  expect(base.onClose).toHaveBeenCalledTimes(1);
});

test('Delete set deletes and closes', async () => {
  await render(<SetTypeSheet {...base} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Delete set' }));
  expect(base.onDelete).toHaveBeenCalledTimes(1);
  expect(base.onClose).toHaveBeenCalledTimes(1);
});

test('the rest row shows only with onRest, shows its value and runs after the sheet is dismissed', async () => {
  const view = await render(<SetTypeSheet {...base} />);
  expect(screen.queryByText('Rest after this exercise')).toBeNull();
  const onRest = jest.fn();
  await view.rerender(<SetTypeSheet {...base} restLabel="1:30" onRest={onRest} />);
  expect(screen.getByText('1:30')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Rest after this exercise, 1:30' }));
  expect(base.onClose).toHaveBeenCalledTimes(1);
  expect(onRest).not.toHaveBeenCalled();
  await fireEvent(screen.getByRole('button', { name: 'Close', hidden: true }), 'dismiss');
  expect(onRest).toHaveBeenCalledTimes(1);
});

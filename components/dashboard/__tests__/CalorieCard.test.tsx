import { render, screen } from '@testing-library/react-native';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { CalorieCard } from '@/components/dashboard/CalorieCard';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: (_: unknown, name: string) => name }));
jest.mock('react-native-svg', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { __esModule: true, default: View, Circle: View };
});

const fontScale = (value: number) => (useWindowDimensions as jest.Mock).mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: value });
beforeEach(() => fontScale(1));

test('shows Left, Goal and Planned as labelled groups', async () => {
  await render(<CalorieCard eaten={1100} goal={2250} planned={320} />);
  expect(screen.getByLabelText('Left, 1,150 calories')).toBeTruthy();
  expect(screen.getByLabelText('Goal, 2,250 calories')).toBeTruthy();
  expect(screen.getByLabelText('Planned, 320 calories')).toBeTruthy();
});

test('over goal reads Over with the excess, in the neutral text color', async () => {
  await render(<CalorieCard eaten={2400} goal={2250} planned={0} />);
  expect(screen.getByLabelText('Over, 150 calories')).toBeTruthy();
  expect(screen.queryByLabelText(/^Left/)).toBeNull();
  const value = screen.getByText('150');
  expect(StyleSheet.flatten(value.props.style).color).toBe('text');
});

test('the ring is read once with its own label', async () => {
  await render(<CalorieCard eaten={1100} goal={2250} planned={0} />);
  expect(screen.getAllByLabelText('1,100 of 2,250 calories')).toHaveLength(1);
});

test('at the largest text size the ring becomes one labelled bar', async () => {
  fontScale(2);
  await render(<CalorieCard eaten={1100} goal={2250} planned={320} />);
  expect(screen.queryByLabelText('1,100 of 2,250 calories')).toBeNull();
  expect(screen.getAllByLabelText('1,100 of 2,250 calories eaten, 1,150 left')).toHaveLength(1);
  expect(screen.getByLabelText('Planned, 320 calories')).toBeTruthy();
});

test('the bar summary says over by when past the goal', async () => {
  fontScale(2);
  await render(<CalorieCard eaten={2400} goal={2250} planned={0} />);
  expect(screen.getByLabelText('2,400 of 2,250 calories eaten, over by 150')).toBeTruthy();
});

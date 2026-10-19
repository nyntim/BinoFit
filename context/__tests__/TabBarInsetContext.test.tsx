import { fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { TabBarInsetProvider, useSetTabBarInset, useTabBarInset, useTabBarInsetMode } from '@/context/TabBarInsetContext';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 12 }) }));

function Probe() {
  const inset = useTabBarInset();
  const mode = useTabBarInsetMode();
  const setInset = useSetTabBarInset();
  return <>
    <Text testID="inset">{inset}</Text>
    <Text testID="mode">{mode}</Text>
    <Pressable accessibilityLabel="Measure bar" onPress={() => setInset(148)} />
  </>;
}

test('automatic mode has zero custom clearance from the first render even after a measurement', async () => {
  await render(<TabBarInsetProvider mode="automatic"><Probe /></TabBarInsetProvider>);
  expect(screen.getByTestId('mode').props.children).toBe('automatic');
  expect(screen.getByTestId('inset').props.children).toBe(0);
  await fireEvent.press(screen.getByLabelText('Measure bar'));
  expect(screen.getByTestId('inset').props.children).toBe(0);
});

test('fallback starts with safe-area clearance and accepts a measured overlay height', async () => {
  await render(<TabBarInsetProvider><Probe /></TabBarInsetProvider>);
  expect(screen.getByTestId('mode').props.children).toBe('measured');
  expect(screen.getByTestId('inset').props.children).toBe(84);
  await fireEvent.press(screen.getByLabelText('Measure bar'));
  expect(screen.getByTestId('inset').props.children).toBe(148);
});

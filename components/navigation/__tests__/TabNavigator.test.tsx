import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import TabNavigator from '@/components/navigation/TabNavigator.ios';

let mockWorkout: object | null = null;
const mockOpen = jest.fn();
jest.mock('@/hooks/useActiveWorkout', () => ({ useActiveWorkout: () => ({ workout: mockWorkout }) }));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: (_: unknown, key: string) => key }));
jest.mock('@/components/navigation/JsTabNavigator', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { __esModule: true, default: function MockJsTabs() { return <View testID="js-tabs" />; } };
});
jest.mock('@/components/workouts/ActiveWorkoutBar', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ActiveWorkoutBar: function MockWorkoutBar() { return <View testID="workout-bar" onTouchEnd={mockOpen} />; } };
});
jest.mock('@/context/TabBarInsetContext', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { TabBarInsetProvider: function MockInsetProvider({ children, mode }: { children: React.ReactNode; mode?: string }) { return <View testID={`provider-${mode ?? 'measured'}`}>{children}</View>; } };
});
jest.mock('expo-router/unstable-native-tabs', () => {
  const { View, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const NativeTabs = ({ children }: { children: React.ReactNode }) => <View testID="native-tabs">{children}</View>;
  NativeTabs.Trigger = Object.assign(
    function MockTrigger({ name, accessibilityLabel, children }: { name: string; accessibilityLabel: string; children: React.ReactNode }) { return <View testID={`route-${name}`} accessibilityLabel={accessibilityLabel}>{children}</View>; },
    { Icon: function MockIcon({ sf }: { sf: string }) { return <Text>{sf}</Text>; }, Label: function MockLabel({ children }: { children: string }) { return <Text>{children}</Text>; } },
  );
  NativeTabs.BottomAccessory = function MockBottomAccessory({ children }: { children: React.ReactNode }) { return <View testID="accessory">{children}</View>; };
  return { NativeTabs };
});

const initialVersion = Platform.Version;
beforeEach(() => { mockWorkout = null; mockOpen.mockClear(); });
afterAll(() => { Object.defineProperty(Platform, 'Version', { configurable: true, value: initialVersion }); });

test('older iOS uses the JS tab navigator', async () => {
  Object.defineProperty(Platform, 'Version', { configurable: true, value: '25.5' });
  await render(<TabNavigator />);
  expect(screen.getByTestId('js-tabs')).toBeTruthy();
  expect(screen.queryByTestId('native-tabs')).toBeNull();
});

test('iOS 26 renders four accessible native routes and only shows the accessory during a workout', async () => {
  Object.defineProperty(Platform, 'Version', { configurable: true, value: '26.0' });
  const result = await render(<TabNavigator />);
  expect(screen.getByTestId('provider-automatic')).toBeTruthy();
  for (const [route, label] of [['index', 'Nutrition'], ['training', 'Training'], ['progress', 'Progress'], ['settings', 'More']]) {
    expect(screen.getByTestId(`route-${route}`).props.accessibilityLabel).toBe(label);
  }
  expect(screen.queryByTestId('accessory')).toBeNull();
  mockWorkout = { id: 'session' };
  await result.rerender(<TabNavigator />);
  expect(screen.getByTestId('workout-bar')).toBeTruthy();
  await fireEvent(screen.getByTestId('workout-bar'), 'touchEnd');
  expect(mockOpen).toHaveBeenCalledTimes(1);
  mockWorkout = null;
  await result.rerender(<TabNavigator />);
  expect(screen.queryByTestId('accessory')).toBeNull();
});

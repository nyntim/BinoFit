import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard, Text } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { FloatingTabBar } from '@/components/navigation/FloatingTabBar';
import { TabBarInsetProvider, useTabBarInset } from '@/context/TabBarInsetContext';

let mockWorkout: object | null = null;
jest.mock('@/hooks/useActiveWorkout', () => ({ useActiveWorkout: () => ({ workout: mockWorkout }) }));
jest.mock('@/components/haptic-tab', () => ({ HapticTab: (props: React.ComponentProps<typeof import('react-native').View>) => { const { View } = jest.requireActual<typeof import('react-native')>('react-native'); return <View accessible {...props} />; } }));
jest.mock('@/components/workouts/ActiveWorkoutBar', () => ({ ActiveWorkoutBar: () => { const { View } = jest.requireActual<typeof import('react-native')>('react-native'); return <View testID="session" />; } }));
jest.mock('@/components/navigation/TabBarSurface', () => ({ TabBarSurface: ({ children }: { children: React.ReactNode }) => { const { View } = jest.requireActual<typeof import('react-native')>('react-native'); return <View>{children}</View>; } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 12, left: 0 }) }));

const names = ['index', 'training', 'progress', 'settings'];
const routes = names.map((name) => ({ key: name, name, params: name === 'training' ? { from: 'test' } : undefined }));
const emit = jest.fn(() => ({ defaultPrevented: false }));
const navigate = jest.fn();
const descriptors = Object.fromEntries(routes.map((route) => [route.key, { options: {} }]));
const props = { state: { routes, index: 0 }, descriptors, navigation: { emit, navigate }, insets: { top: 0, right: 0, bottom: 12, left: 0 } } as unknown as BottomTabBarProps;

function Inset() { return <Text testID="inset">{useTabBarInset()}</Text>; }
async function mount() { return render(<TabBarInsetProvider><Inset /><FloatingTabBar {...props} /></TabBarInsetProvider>); }

beforeEach(() => { mockWorkout = null; emit.mockReset().mockReturnValue({ defaultPrevented: false }); navigate.mockReset(); });

test('exposes four selected tab names and preserves tab events and params', async () => {
  await mount();
  expect(screen.getByRole('tab', { name: 'Nutrition' }).props.accessibilityState.selected).toBe(true);
  for (const label of ['Training', 'Progress', 'Settings']) expect(screen.getByRole('tab', { name: label })).toBeTruthy();
  await fireEvent.press(screen.getByRole('tab', { name: 'Nutrition' }));
  expect(emit).toHaveBeenCalledWith({ type: 'tabPress', target: 'index', canPreventDefault: true });
  expect(navigate).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('tab', { name: 'Training' }));
  expect(navigate).toHaveBeenCalledWith('training', { from: 'test' });
  await fireEvent(screen.getByRole('tab', { name: 'Settings' }), 'longPress');
  expect(emit).toHaveBeenCalledWith({ type: 'tabLongPress', target: 'settings' });
});

test('prevented press does not navigate', async () => {
  emit.mockReturnValue({ defaultPrevented: true });
  await mount();
  await fireEvent.press(screen.getByRole('tab', { name: 'Training' }));
  expect(navigate).not.toHaveBeenCalled();
});

test('keyboard hides both controls and clears then restores overlay clearance', async () => {
  mockWorkout = {};
  const listeners: Record<string, () => void> = {};
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, listener: () => void) => {
    listeners[event] = listener;
    return { remove: jest.fn() };
  }) as unknown as typeof Keyboard.addListener);
  const result = await mount();
  expect(screen.getByTestId('session')).toBeTruthy();
  await fireEvent(screen.getByTestId('floating-overlay'), 'layout', { nativeEvent: { layout: { height: 148 } } });
  expect(screen.getByTestId('inset').props.children).toBe(148);
  await result.rerender(<TabBarInsetProvider><Inset /><FloatingTabBar {...props} /></TabBarInsetProvider>);
  const show = listeners.keyboardWillShow ?? listeners.keyboardDidShow;
  const hide = listeners.keyboardWillHide ?? listeners.keyboardDidHide;
  await act(() => show());
  expect(screen.queryByTestId('session')).toBeNull();
  expect(screen.queryByRole('tab', { name: 'Nutrition' })).toBeNull();
  expect(screen.getByTestId('inset').props.children).toBe(0);
  await act(() => hide());
  expect(screen.getByTestId('inset').props.children).toBe(148);
  jest.restoreAllMocks();
});

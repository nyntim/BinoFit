import { act, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import { TabBarSurface } from '@/components/navigation/TabBarSurface.ios';
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

jest.mock('expo-blur', () => ({ BlurView: ({ children }: { children?: React.ReactNode }) => { const { View } = jest.requireActual<typeof import('react-native')>('react-native'); return <View testID="blur">{children}</View>; } }));
jest.mock('expo-glass-effect', () => ({
  GlassView: () => { const { View } = jest.requireActual<typeof import('react-native')>('react-native'); return <View testID="glass" />; },
  isLiquidGlassAvailable: jest.fn(),
  isGlassEffectAPIAvailable: jest.fn(),
}));
jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'light' }));

let enabled = false;
let changed: ((value: boolean) => void) | undefined;
beforeEach(() => {
  enabled = false;
  changed = undefined;
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockImplementation(async () => enabled);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_event: string, listener: (value: boolean) => void) => {
    changed = listener as (value: boolean) => void;
    return { remove: jest.fn() };
  }) as unknown as typeof AccessibilityInfo.addEventListener);
  jest.mocked(isLiquidGlassAvailable).mockReturnValue(true);
  jest.mocked(isGlassEffectAPIAvailable).mockReturnValue(true);
});
afterEach(() => jest.restoreAllMocks());

test('uses native glass only when both runtime checks pass', async () => {
  await render(<TabBarSurface><Text>Tabs</Text></TabBarSurface>);
  await waitFor(() => expect(screen.getByTestId('glass')).toBeTruthy());
  jest.mocked(isGlassEffectAPIAvailable).mockReturnValue(false);
  await render(<TabBarSurface><Text>Tabs</Text></TabBarSurface>);
  await waitFor(() => expect(screen.getByTestId('blur')).toBeTruthy());
});

test('starts opaque and responds to Reduce Transparency changes', async () => {
  enabled = true;
  await render(<TabBarSurface><Text>Tabs</Text></TabBarSurface>);
  expect(screen.queryByTestId('glass')).toBeNull();
  expect(screen.queryByTestId('blur')).toBeNull();
  await act(() => changed?.(false));
  await waitFor(() => expect(screen.getByTestId('glass')).toBeTruthy());
  await act(() => changed?.(true));
  expect(screen.queryByTestId('glass')).toBeNull();
});


test('shared material retains the fallback tab shell shape', async () => {
  const result = await render(<TabBarSurface><Text>Tabs</Text></TabBarSurface>);
  await waitFor(() => expect(screen.getByTestId('glass')).toBeTruthy());
  const shell = screen.getByText('Tabs').parent;
  expect(StyleSheet.flatten(shell?.props.style)).toMatchObject({ borderRadius: 32, borderWidth: 1, backgroundColor: 'transparent', opacity: 1 });
  await result.unmount();
});

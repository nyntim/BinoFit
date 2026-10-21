import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Pressable, StyleSheet, Text } from 'react-native';
import { TabBarSurface } from '@/components/navigation/TabBarSurface.ios';
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

const { TabBarSurface: SolidSurface } = jest.requireActual('../TabBarSurface.tsx') as typeof import('../TabBarSurface');

jest.mock('expo-blur', () => ({ BlurView: (props: object) => { const { View } = jest.requireActual('react-native'); return <View {...props} testID="blur" />; } }));
jest.mock('expo-glass-effect', () => ({
  GlassView: (props: object) => { const { View } = jest.requireActual('react-native'); return <View {...props} testID="glass" />; },
  isLiquidGlassAvailable: jest.fn(), isGlassEffectAPIAvailable: jest.fn(),
}));
let mockScheme: 'light' | 'dark' = 'light';
jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => mockScheme }));
let changed: (enabled: boolean) => void;
let remove: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  mockScheme = 'light';
  remove = jest.fn();
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_event: string, listener: typeof changed) => {
    changed = listener; return { remove };
  }) as unknown as typeof AccessibilityInfo.addEventListener);
  jest.mocked(isLiquidGlassAvailable).mockReturnValue(true);
  jest.mocked(isGlassEffectAPIAvailable).mockReturnValue(true);
});
afterEach(() => jest.restoreAllMocks());

test.each([[true, true, 'glass'], [true, false, 'blur'], [false, true, 'blur']])('runtime availability %s/%s selects %s', async (liquid, api, visual) => {
  jest.mocked(isLiquidGlassAvailable).mockReturnValue(liquid);
  jest.mocked(isGlassEffectAPIAvailable).mockReturnValue(api);
  await render(<TabBarSurface testID="surface"><Text>Actions</Text></TabBarSurface>);
  await waitFor(() => expect(screen.getByTestId(visual, { includeHiddenElements: true })).toBeTruthy());
  if (visual === 'glass') expect(StyleSheet.flatten(screen.getByTestId('surface').props.style).backgroundColor).toBe('transparent');
});

test('preference failures stay opaque and live changes update material and clean up', async () => {
  jest.mocked(AccessibilityInfo.isReduceTransparencyEnabled).mockRejectedValue(new Error('unavailable'));
  const result = await render(<TabBarSurface><Text>Actions</Text></TabBarSurface>);
  expect(screen.queryByTestId('glass', { includeHiddenElements: true })).toBeNull();
  expect(screen.queryByTestId('blur', { includeHiddenElements: true })).toBeNull();
  await act(() => changed(false));
  expect(screen.getByTestId('glass', { includeHiddenElements: true })).toBeTruthy();
  await act(() => changed(true));
  expect(screen.queryByTestId('glass', { includeHiddenElements: true })).toBeNull();
  await result.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});

test('starts opaque and a late initial query cannot override a changed preference', async () => {
  let resolve!: (enabled: boolean) => void;
  jest.mocked(AccessibilityInfo.isReduceTransparencyEnabled).mockReturnValue(new Promise((done) => { resolve = done; }));
  await render(<TabBarSurface><Text>Actions</Text></TabBarSurface>);
  expect(screen.queryByTestId('glass', { includeHiddenElements: true })).toBeNull();
  await act(() => changed(true));
  await act(() => resolve(false));
  expect(screen.queryByTestId('glass', { includeHiddenElements: true })).toBeNull();
  expect(screen.queryByTestId('blur', { includeHiddenElements: true })).toBeNull();
});

test('failed runtime checks use blur and forced themes reach the glass', async () => {
  jest.mocked(isLiquidGlassAvailable).mockImplementation(() => { throw new Error('runtime'); });
  const result = await render(<TabBarSurface />);
  await waitFor(() => expect(screen.getByTestId('blur', { includeHiddenElements: true })).toBeTruthy());
  jest.mocked(isLiquidGlassAvailable).mockReturnValue(true);
  mockScheme = 'dark';
  await result.rerender(<TabBarSurface />);
  expect(screen.getByTestId('glass', { includeHiddenElements: true }).props.colorScheme).toBe('dark');
});

test('decoration is hidden and untouchable while disabled children retain their action gate', async () => {
  const press = jest.fn();
  const result = await render(<TabBarSurface testID="surface" style={{ opacity: 0.2 }}><Pressable disabled onPress={press} accessibilityRole="button" accessibilityLabel="Save"><Text>Save</Text></Pressable></TabBarSurface>);
  await waitFor(() => expect(screen.getByTestId('glass', { includeHiddenElements: true })).toBeTruthy());
  const visual = screen.getByTestId('glass', { includeHiddenElements: true });
  expect(visual.props.pointerEvents).toBe('none');
  expect(visual.props.accessibilityElementsHidden).toBe(true);
  expect(visual.props.importantForAccessibility).toBe('no-hide-descendants');
  expect(StyleSheet.flatten(screen.getByTestId('surface').props.style).opacity).toBe(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(press).not.toHaveBeenCalled();
  await result.rerender(<TabBarSurface><Pressable onPress={press} accessibilityRole="button" accessibilityLabel="Save"><Text>Save</Text></Pressable></TabBarSurface>);
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(press).toHaveBeenCalledTimes(1);
});

test('default surface is solid without invoking native availability checks', async () => {
  await render(<SolidSurface><Text>Actions</Text></SolidSurface>);
  expect(screen.queryByTestId('glass', { includeHiddenElements: true })).toBeNull();
  expect(isLiquidGlassAvailable).not.toHaveBeenCalled();
  expect(StyleSheet.flatten(screen.getByText('Actions').parent?.props.style).backgroundColor).toBeTruthy();
});

test('retains the fallback tab shell shape', async () => {
  await render(<TabBarSurface testID="surface"><Text>Tabs</Text></TabBarSurface>);
  await waitFor(() => expect(screen.getByTestId('glass', { includeHiddenElements: true })).toBeTruthy());
  expect(StyleSheet.flatten(screen.getByTestId('surface').props.style)).toMatchObject({ borderRadius: 32, borderWidth: 1, opacity: 1 });
});

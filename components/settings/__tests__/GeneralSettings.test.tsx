import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SettingsScreen from '@/app/(tabs)/settings';
import { loadPreferences, resetPreferences } from '@/lib/app-preferences';
import { getUserProfile, saveUserProfile } from '@/lib/storage';
import { saveWeightEntry } from '@/lib/weight';
import { lbToKg } from '@/lib/units';
import { router } from 'expo-router';

const mockRunSync = jest.fn();
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => '#333333' }));
jest.mock('@/context/TabBarInsetContext', () => ({ useTabBarInset: () => 0, useTabBarInsetMode: () => 'manual' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(callback, [callback]);
  },
}));
jest.mock('@/components/settings/AccountSection', () => ({ AccountSection: () => {
  const { Text } = jest.requireActual('react-native');
  return <Text>Account</Text>;
} }));
jest.mock('@/components/settings/ExportDataSheet', () => ({ ExportDataSheet: ({ visible }: { visible: boolean }) => {
  const { Text } = jest.requireActual('react-native');
  return visible ? <Text>Export sheet</Text> : null;
} }));
jest.mock('@/hooks/use-health-kit', () => ({ useHealthKit: () => ({ available: true, syncing: false, runSync: mockRunSync }) }));
jest.mock('@/hooks/useSyncStatus', () => ({ useSyncStatus: () => ({ state: {}, now: 0 }) }));
jest.mock('@/lib/sync-status', () => ({ deriveLastSynced: () => ({ kind: 'never' }), isSyncConfigured: () => true }));
jest.mock('@/lib/sync', () => ({ syncToSupabase: jest.fn() }));
jest.mock('@/lib/weight', () => ({
  ...jest.requireActual('@/lib/weight'),
  getLatestWeightEntry: jest.fn(async () => null),
  saveWeightEntry: jest.fn(async () => undefined),
}));

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetPreferences();
  await loadPreferences();
  await saveUserProfile({ weight: 70, height: 175, activity_level: 'moderate' });
});

test('More has one general unit control, persists selections, and retains general actions', async () => {
  await render(<SettingsScreen />);
  await screen.findByDisplayValue('154.32');
  expect(screen.getByText('General')).toBeTruthy();
  expect(screen.getAllByText('Units')).toHaveLength(1);
  expect(screen.getByRole('radio', { name: 'lb', selected: true })).toBeTruthy();
  expect(screen.queryByText('Nutrition')).toBeNull();
  expect(screen.queryByText('Training')).toBeNull();
  expect(screen.queryByLabelText('Nutrition settings')).toBeNull();
  expect(screen.queryByLabelText('Training settings')).toBeNull();
  expect(screen.getByText('Account')).toBeTruthy();
  expect(screen.getByText('Personal Stats')).toBeTruthy();
  expect(screen.getByText('App Info')).toBeTruthy();

  await fireEvent.press(screen.getByRole('radio', { name: 'kg' }));
  await screen.findByDisplayValue('70');
  await waitFor(async () => expect(await AsyncStorage.getItem('weight_unit')).toBe('kg'));
  expect(screen.getByText('Weight (kg)')).toBeTruthy();
  await fireEvent.press(screen.getByRole('radio', { name: 'lb' }));
  await screen.findByDisplayValue('154.32');
  await waitFor(async () => expect(await AsyncStorage.getItem('weight_unit')).toBe('lb'));

  await fireEvent.press(screen.getByLabelText('Export data'));
  expect(screen.getByText('Export sheet')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Sync with Apple Health'));
  expect(mockRunSync).toHaveBeenCalledTimes(1);
  const alert = jest.spyOn(Alert, 'alert');
  await fireEvent.press(screen.getByText('Reset Setup'));
  const reset = alert.mock.calls[0][2]?.find((button) => button.text === 'Reset');
  await act(async () => { await reset?.onPress?.(); });
  expect(router.replace).toHaveBeenCalledWith('/onboarding');
  expect(await AsyncStorage.getItem('weight_unit')).toBe('lb');
  alert.mockRestore();
});

test('changing units converts typed personal weight and saves kilograms', async () => {
  await render(<SettingsScreen />);
  const input = await screen.findByDisplayValue('154.32');
  await fireEvent.changeText(input, '176.37');
  await fireEvent.press(screen.getByRole('radio', { name: 'kg' }));
  await screen.findByDisplayValue('80');
  expect(screen.getByText('Weight (kg)')).toBeTruthy();
  await fireEvent.press(screen.getByRole('radio', { name: 'lb' }));
  await screen.findByDisplayValue('176.37');
  await fireEvent.press(screen.getByText('Save personal stats'));
  await waitFor(() => expect(saveWeightEntry).toHaveBeenCalledWith({ weight_kg: lbToKg(176.37) }));
  await waitFor(async () => expect((await getUserProfile())?.weight).toBeCloseTo(80.001, 2));
});

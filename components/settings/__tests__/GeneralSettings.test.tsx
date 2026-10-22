import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SettingsScreen from '@/app/(tabs)/settings';
import PreferencesScreen from '@/app/settings/preferences';
import TrainingSettings from '@/app/settings/training';
import { TrainingSection } from '@/components/settings/TrainingSection';
import { getPreferences, loadPreferences, reloadPreferences, resetPreferences, setWeightUnit } from '@/lib/app-preferences';
import { getLastSyncAt, saveUserProfile } from '@/lib/storage';
import { router } from 'expo-router';
import { getMealDefinitions } from '@/lib/database';
import { getReminderPermission } from '@/lib/notification-permissions';
import * as Notifications from 'expo-notifications';
const originalSetItem = (AsyncStorage.setItem as jest.Mock).getMockImplementation()!;
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => 'gray' }));
jest.mock('@/context/TabBarInsetContext', () => ({ useTabBarInset: () => 0, useTabBarInsetMode: () => 'manual' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useFocusEffect: (callback: () => void) => { jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]); } }));
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ status: 'anonymous', email: null }) }));
const mockSyncState = { status: 'idle', isOffline: false, lastSuccessAt: null };
jest.mock('@/hooks/useSyncStatus', () => ({ useSyncStatus: () => ({ state: mockSyncState }) }));
jest.mock('@/lib/database', () => ({ getMealDefinitions: jest.fn() }));
jest.mock('@/lib/notification-permissions', () => ({ getReminderPermission: jest.fn() }));
jest.mock('@/lib/sync-status', () => ({ isSyncConfigured: () => true }));
jest.mock('@/lib/weight', () => ({ getLatestWeightEntry: jest.fn(async () => null) }));
beforeEach(async () => { jest.clearAllMocks(); mockSyncState.status = 'idle'; mockSyncState.isOffline = false; (getMealDefinitions as jest.Mock).mockResolvedValue([{ reminder_time: '08:00' }, { reminder_time: null }, { reminder_time: 'bad' }]); (getReminderPermission as jest.Mock).mockResolvedValue('denied'); await AsyncStorage.clear(); resetPreferences(); await loadPreferences(); await saveUserProfile({ weight: 70, height: 175, activity_level: 'moderate' }); });
test('Settings directory has all ten focused destinations and truthful summaries', async () => {
  await render(<SettingsScreen />); await screen.findByText('154.32 lb');
  for (const heading of ['You', 'App', 'Account and data', 'Help']) expect(screen.getByRole('header', { name: heading })).toBeTruthy();
  const destinations = ['Profile', 'Nutrition', 'Training', 'Preferences', 'Notifications', 'Account', 'Integrations', 'Data and Privacy', 'About', 'Support'];
  for (const label of destinations) { await fireEvent.press(screen.getByText(label)); expect(router.push).toHaveBeenLastCalledWith(`/settings/${label === 'Data and Privacy' ? 'data-privacy' : label.toLowerCase()}`); }
  expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  expect(screen.getByText('Guest account')).toBeTruthy();
});
test('Preferences persists units without changing stored measurements and forces appearance', async () => {
  const before = await AsyncStorage.getItem('user_profile');
  await render(<PreferencesScreen />);
  await fireEvent.press(screen.getByRole('radio', { name: 'Metric' }));
  await waitFor(async () => expect(await AsyncStorage.getItem('weight_unit')).toBe('kg'));
  await fireEvent.press(screen.getByText('Dark'));
  await waitFor(async () => expect(await AsyncStorage.getItem('appearance')).toBe('dark'));
  await fireEvent.press(screen.getByRole('radio', { name: 'Imperial' }));
  await waitFor(async () => expect(await AsyncStorage.getItem('weight_unit')).toBe('lb'));
  expect(await AsyncStorage.getItem('user_profile')).toBe(before);
});

test('the last explicit unit selection wins while the first disk write is pending', async () => {
  await setWeightUnit('kg');
  const original = originalSetItem;
  let release!: () => void;
  let first = true;
  const spy = jest.spyOn(AsyncStorage, 'setItem').mockImplementation((key, value) => {
    if (key === 'weight_unit' && first) {
      first = false;
      return new Promise<void>(resolve => { release = () => { void original(key, value).then(resolve); }; });
    }
    return original(key, value);
  });
  try {
    await render(<PreferencesScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Imperial' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Metric' }));
    expect(getPreferences().weightUnit).toBe('kg');
    await act(async () => { release(); });
    await waitFor(async () => expect(await AsyncStorage.getItem('weight_unit')).toBe('kg'));
  } finally { spy.mockRestore(); (AsyncStorage.setItem as jest.Mock).mockImplementation(originalSetItem); }
});

test('rapid default-set increments accumulate while persistence is pending', async () => {
  const original = originalSetItem;
  let release!: () => void;
  let first = true;
  const spy = jest.spyOn(AsyncStorage, 'setItem').mockImplementation((key, value) => {
    if (key === 'default_set_count' && first) {
      first = false;
      return new Promise<void>(resolve => { release = () => { void original(key, value).then(resolve); }; });
    }
    return original(key, value);
  });
  try {
    await render(<TrainingSection />);
    await fireEvent.press(screen.getByLabelText('More default sets'));
    await fireEvent.press(screen.getByLabelText('More default sets'));
    expect(getPreferences().defaultSetCount).toBe(4);
    await act(async () => { release(); });
    await waitFor(async () => expect(await AsyncStorage.getItem('default_set_count')).toBe('4'));
  } finally { spy.mockRestore(); (AsyncStorage.setItem as jest.Mock).mockImplementation(originalSetItem); }
});

test('directory reports blocked configured reminders and never-synced cloud without prompting', async () => {
  await render(<SettingsScreen />);
  await screen.findByText('Blocked · 1 configured');
  await screen.findByText('Cloud never synced');
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});
test('directory retains the actual historical cloud success and distinguishes missing reminder data', async () => {
  await AsyncStorage.setItem('last_sync_at', '2026-10-21T12:00:00Z');
  (getMealDefinitions as jest.Mock).mockRejectedValueOnce(new Error('read'));
  (getReminderPermission as jest.Mock).mockResolvedValueOnce('provisional');
  await render(<SettingsScreen />);
  await screen.findByText('Quiet delivery · Reminder count unknown');
  expect(await screen.findByText(/^Cloud synced /)).toBeTruthy();
  expect(await getLastSyncAt()).toBe('2026-10-21T12:00:00Z');
});
test.each([['syncing', false, 'Cloud syncing…'], ['failed', false, 'Cloud sync failed'], ['idle', true, 'Cloud offline']])('directory exposes current cloud %s state', async (status, offline, label) => {
  mockSyncState.status = status as string; mockSyncState.isOffline = offline as boolean;
  await render(<SettingsScreen />);
  expect(screen.getByText(label as string)).toBeTruthy();
});

test('appearance radios have one native touch responder and directly persist selections', async () => {
  await render(<PreferencesScreen />);
  for (const label of ['Light', 'Dark', 'System']) {
    const radio = screen.getByRole('radio', { name: label });
    expect(typeof radio.props.onStartShouldSetResponder).toBe('function');
    expect(radio.queryAll(node => typeof node.props.onStartShouldSetResponder === 'function')).toHaveLength(0);
    await fireEvent.press(radio);
    expect(screen.getByRole('radio', { name: label, selected: true })).toBeTruthy();
    await waitFor(async () => expect(await AsyncStorage.getItem('appearance')).toBe(label.toLowerCase()));
  }
});


test.each([['false', 'rir', 'None'], ['true', 'rir', 'RIR'], ['true', 'rpe', 'RPE']])('Training hydrates legacy %s/%s as %s', async (enabled, metric, label) => {
  await AsyncStorage.setItem('show_rpe', enabled);
  await AsyncStorage.setItem('effort_metric', metric);
  await act(async () => { await reloadPreferences(); });
  await render(<TrainingSection />);
  expect(screen.getByRole('radio', { name: label, selected: true })).toBeTruthy();
  expect(screen.getAllByRole('radio').map(radio => radio.props.accessibilityState.selected)).toEqual(['None', 'RIR', 'RPE'].map(option => option === label));
  await fireEvent.press(screen.getByRole('radio', { name: 'None' }));
  await waitFor(async () => expect(await AsyncStorage.getItem('show_rpe')).toBe('false'));
  expect(await AsyncStorage.getItem('effort_metric')).toBe(metric);
  await fireEvent.press(screen.getByRole('radio', { name: 'RIR' }));
  await waitFor(() => expect(screen.getByRole('radio', { name: 'RIR', selected: true })).toBeTruthy());
  expect(await AsyncStorage.getItem('effort_metric')).toBe('rir');
});


test('Training shows a failed scale write and retries without enabling an unintended scale', async () => {
  await render(<TrainingSettings />);
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk'));
  await fireEvent.press(screen.getByRole('radio', { name: 'RIR' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save preferences. Try again.');
  expect(screen.getByRole('radio', { name: 'None', selected: true })).toBeTruthy();
  await fireEvent.press(screen.getByRole('radio', { name: 'RIR' }));
  await waitFor(() => expect(screen.getByRole('radio', { name: 'RIR', selected: true })).toBeTruthy());
  expect(screen.queryByRole('alert')).toBeNull();
});

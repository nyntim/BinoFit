import React from 'react';
import Constants from 'expo-constants';
import { Alert, AppState, Linking, type AppStateStatus } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import NotificationsSettings from '@/app/settings/notifications';
import DataPrivacySettings from '@/app/settings/data-privacy';
import AboutSettings from '@/app/settings/about';
import SupportSettings from '@/app/settings/support';
import { getReminderPermission } from '@/lib/notification-permissions';
import { getMealDefinitions, getMealNames } from '@/lib/database';
import { requestReminderPermission, restoreMealReminders } from '@/lib/reminders';
import { resetOnboarding } from '@/lib/storage';
import { settingsDestination } from '@/lib/settings-destinations';
import { isSyncConfigured } from '@/lib/sync-status';
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => 'gray' }));
jest.mock('@/components/settings/SettingsPage', () => ({
  SettingsPage: ({ title, children }: { title: string; children: React.ReactNode }) => { const { View, Text } = jest.requireActual('react-native'); return <View><Text>{title}</Text>{children}</View>; },
}));
jest.mock('@/components/settings/ExportDataSheet', () => ({ ExportDataSheet: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: (fn: () => void) => { const React = jest.requireActual('react'); React.useEffect(fn, [fn]); } }));
jest.mock('@/lib/notification-permissions', () => ({ getReminderPermission: jest.fn(), canDeliverReminders: (v: string) => v === 'granted' || v === 'provisional' }));
jest.mock('@/lib/database', () => ({ getMealDefinitions: jest.fn(), getMealNames: jest.fn() }));
jest.mock('@/hooks/usePreferences', () => ({ usePreferences: () => ({ restTimerEnabled: true }) }));
jest.mock('@/lib/sync-status', () => ({ isSyncConfigured: jest.fn(() => true) }));
jest.mock('@/lib/auth', () => ({ countUnsynced: jest.fn(async () => 3) }));
jest.mock('@/lib/reminders', () => ({ requestReminderPermission: jest.fn(), restoreMealReminders: jest.fn() }));
jest.mock('@/lib/storage', () => ({ resetOnboarding: jest.fn(async () => {}) }));
jest.mock('@/lib/settings-destinations', () => ({ ...jest.requireActual('@/lib/settings-destinations'), settingsDestination: jest.fn(() => null) }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { nativeAppVersion: '2.0', nativeBuildVersion: '42' } }));
const meals = [{ id: 'm1', position: 0, reminder_time: '08:00', calorie_target: null }, { id: 'm2', position: 1, reminder_time: null, calorie_target: null }];
const names = [{ meal_id: 'm1', name: 'Breakfast', effective_from: '0000-01-01' }, { meal_id: 'm2', name: 'Lunch', effective_from: '0000-01-01' }];
beforeEach(() => { jest.clearAllMocks(); (isSyncConfigured as jest.Mock).mockReturnValue(true); (settingsDestination as jest.Mock).mockReturnValue(null); jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() }); (getReminderPermission as jest.Mock).mockResolvedValue('denied'); (getMealDefinitions as jest.Mock).mockResolvedValue(meals); (getMealNames as jest.Mock).mockResolvedValue(names); });
it('lists each meal reminder when blocked, opens system settings and refreshes on foreground', async () => {
  let foreground!: (state: AppStateStatus) => void;
  const subscription = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { foreground = listener; return { remove: jest.fn() }; });
  const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  await render(<NotificationsSettings />);
  await screen.findByText('Breakfast');
  expect(screen.getByText(new Date(2000, 0, 1, 8, 0).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))).toBeTruthy();
  expect(screen.getByText('Lunch')).toBeTruthy();
  expect(screen.getByText('Off')).toBeTruthy();
  expect(screen.getByText('Blocked in system settings')).toBeTruthy();
  expect(screen.getByText('Configured reminders cannot be delivered until notifications are allowed.')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Open system settings'));
  expect(open).toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Manage meal reminders'));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/(tabs)', params: { manageMeals: '1' } });
  (getReminderPermission as jest.Mock).mockResolvedValue('provisional');
  await act(async () => foreground('active'));
  await screen.findByText('Quiet delivery');
  subscription.mockRestore(); open.mockRestore();
});
it('restarts only onboarding after confirmation and names preservation explicitly', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  await render(<DataPrivacySettings />);
  await fireEvent.press(screen.getByText('Restart setup'));
  expect(resetOnboarding).not.toHaveBeenCalled();
  expect(alert.mock.calls.at(-1)?.[1]).toContain('account, history and saved goals');
  await act(async () => { await alert.mock.calls.at(-1)?.[2]?.find((b) => b.text === 'Restart setup')?.onPress?.(); });
  expect(resetOnboarding).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledWith({ pathname: '/onboarding', params: { restart: '1' } });
  alert.mockRestore();
});
it('shows runtime version/build and routes both legal destinations internally', async () => {
  await render(<AboutSettings />);
  expect(screen.getByText('Version 2.0 · Build 42')).toBeTruthy();
  await fireEvent.press(screen.getByText('Privacy policy'));
  expect(router.push).toHaveBeenLastCalledWith('/settings/privacy-policy');
  await fireEvent.press(screen.getByText('Terms of service'));
  expect(router.push).toHaveBeenLastCalledWith('/settings/terms');
});
it('opens configured support destination, reports open failure and attaches no diagnostics', async () => {
  (settingsDestination as jest.Mock).mockImplementation((kind) => kind === 'support' ? 'https://example.com/help' : null);
  const open = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('cannot open'));
  await render(<SupportSettings />);
  await fireEvent.press(screen.getByText('Report a problem'));
  await waitFor(() => expect(open).toHaveBeenCalledWith('https://example.com/help'));
  await screen.findByText('Could not open report a problem. Try again.');
  expect(router.push).not.toHaveBeenCalled();
  open.mockRestore();
});

it('disables Allow during a request and refreshes status after the shared request resolves', async () => {
  (getReminderPermission as jest.Mock).mockResolvedValue('not-determined');
  let finish!: (allowed: boolean) => void;
  (requestReminderPermission as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await render(<NotificationsSettings />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Allow notifications' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Allow notifications' }));
  expect(requestReminderPermission).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Allow notifications' }).props.accessibilityState).toMatchObject({ disabled: true, busy: true });
  (getReminderPermission as jest.Mock).mockResolvedValue('granted');
  await act(async () => { finish(true); });
  await screen.findByText('Allowed');
  expect(restoreMealReminders).toHaveBeenCalledTimes(1);
});
it('shows request failures and clears a reminder-read failure after a successful foreground refresh', async () => {
  let foreground!: (state: AppStateStatus) => void;
  const subscription = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { foreground = listener; return { remove: jest.fn() }; });
  (getReminderPermission as jest.Mock).mockResolvedValue('not-determined');
  (getMealDefinitions as jest.Mock).mockRejectedValueOnce(new Error('read failed'));
  (requestReminderPermission as jest.Mock).mockResolvedValueOnce(false);
  await render(<NotificationsSettings />);
  await screen.findByText('Could not read meal reminders. Return here to retry.');
  await fireEvent.press(screen.getByRole('button', { name: 'Allow notifications' }));
  await screen.findByText('Could not enable notifications. Try again or check your device Settings.');
  await act(async () => foreground('active'));
  await waitFor(() => expect(screen.queryByText('Could not read meal reminders. Return here to retry.')).toBeNull());
  expect(screen.getByText('Breakfast')).toBeTruthy();
  subscription.mockRestore();
});

it('shows native platform build metadata when the legacy top-level build is absent', async () => {
  const priorBuild = Constants.nativeBuildVersion;
  const priorPlatform = Constants.platform;
  Constants.nativeBuildVersion = undefined;
  Constants.platform = { ios: { buildNumber: '123' } } as typeof Constants.platform;
  try {
    await render(<AboutSettings />);
    expect(screen.getByText(/Build 123$/)).toBeTruthy();
  } finally {
    Constants.nativeBuildVersion = priorBuild;
    Constants.platform = priorPlatform;
  }
});

it('routes unconfigured report and feedback internally', async () => {
  await render(<SupportSettings />);
  await fireEvent.press(screen.getByText('Report a problem'));
  expect(router.push).toHaveBeenLastCalledWith('/settings/report-problem');
  await fireEvent.press(screen.getByText('Send feedback'));
  expect(router.push).toHaveBeenLastCalledWith('/settings/feedback');
});
it('Data and privacy uses the same internal privacy destination as About', async () => {
  await render(<DataPrivacySettings />);
  await fireEvent.press(screen.getByText('Privacy policy'));
  expect(router.push).toHaveBeenLastCalledWith('/settings/privacy-policy');
});

it('opens an approved configured external link instead of the internal page', async () => {
  (settingsDestination as jest.Mock).mockImplementation(kind => kind === 'privacy' ? 'https://example.com/privacy' : null);
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  try {
    await render(<AboutSettings />);
    await fireEvent.press(screen.getByText('Privacy policy'));
    expect(open).toHaveBeenCalledWith('https://example.com/privacy');
    expect(router.push).not.toHaveBeenCalled();
  } finally { open.mockRestore(); }
});

it('Data and privacy lists what is backed up, what stays on the phone and the unsynced count', async () => {
  await render(<DataPrivacySettings />);
  expect(screen.getByLabelText('Weight history, backed up')).toBeTruthy();
  expect(screen.getByLabelText('Water logs, quick-add drinks and meal confirmations, this phone only')).toBeTruthy();
  expect(await screen.findByText('3')).toBeTruthy();
});
it('Data and privacy reports backed-up rows as not in this build when sync is unavailable', async () => {
  (isSyncConfigured as jest.Mock).mockReturnValue(false);
  await render(<DataPrivacySettings />);
  expect(screen.getByLabelText('Weight history, not in this build')).toBeTruthy();
  expect(screen.getByLabelText('Preferences, active workouts, drafts and Spotify, this phone only')).toBeTruthy();
});

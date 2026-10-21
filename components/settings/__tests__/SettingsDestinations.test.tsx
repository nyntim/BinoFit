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
import { getMealDefinitions } from '@/lib/database';
import { requestReminderPermission, restoreMealReminders } from '@/lib/reminders';
import { resetOnboarding } from '@/lib/storage';
import { settingsDestination } from '@/lib/settings-destinations';
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => 'gray' }));
jest.mock('@/components/settings/SettingsPage', () => ({
  SettingsPage: ({ title, children }: { title: string; children: React.ReactNode }) => { const { View, Text } = jest.requireActual('react-native'); return <View><Text>{title}</Text>{children}</View>; },
  SettingsRow: jest.requireActual('@/components/settings/SettingsRow').SettingsRow,
}));
jest.mock('@/components/settings/ExportDataSheet', () => ({ ExportDataSheet: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: (fn: () => void) => { const React = jest.requireActual('react'); React.useEffect(fn, [fn]); } }));
jest.mock('@/lib/notification-permissions', () => ({ getReminderPermission: jest.fn(), canDeliverReminders: (v: string) => v === 'granted' || v === 'provisional' }));
jest.mock('@/lib/database', () => ({ getMealDefinitions: jest.fn() }));
jest.mock('@/lib/reminders', () => ({ requestReminderPermission: jest.fn(), restoreMealReminders: jest.fn() }));
jest.mock('@/lib/storage', () => ({ resetOnboarding: jest.fn(async () => {}) }));
jest.mock('@/lib/settings-destinations', () => ({ settingsDestination: jest.fn(() => null) }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { nativeAppVersion: '2.0', nativeBuildVersion: '42' } }));
beforeEach(() => { jest.clearAllMocks(); jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() }); (getReminderPermission as jest.Mock).mockResolvedValue('denied'); (getMealDefinitions as jest.Mock).mockResolvedValue([{ reminder_time: '08:00' }, { reminder_time: null }]); });
it('shows configured reminder count when blocked, opens system settings and refreshes on foreground', async () => {
  let foreground!: (state: AppStateStatus) => void;
  const subscription = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { foreground = listener; return { remove: jest.fn() }; });
  const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  await render(<NotificationsSettings />);
  await screen.findByText('1 configured');
  expect(screen.getByText('Blocked in system settings')).toBeTruthy();
  await fireEvent.press(screen.getByText('Open system settings'));
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
it('shows runtime version/build and honest unavailable legal destinations', async () => {
  await render(<AboutSettings />);
  expect(screen.getByText('2.0')).toBeTruthy(); expect(screen.getByText('42')).toBeTruthy();
  expect(screen.getAllByText('Unavailable')).toHaveLength(2);
});
it('opens configured support destination, reports open failure and attaches no diagnostics', async () => {
  (settingsDestination as jest.Mock).mockImplementation((kind) => kind === 'support' ? 'https://example.com/help' : null);
  const open = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('cannot open'));
  await render(<SupportSettings />);
  await fireEvent.press(screen.getByText('Report a problem'));
  await waitFor(() => expect(open).toHaveBeenCalledWith('https://example.com/help'));
  await screen.findByText('Could not open report a problem. Try again.');
  open.mockRestore();
});

it('disables Allow during a request and refreshes status after the shared request resolves', async () => {
  (getReminderPermission as jest.Mock).mockResolvedValue('not-determined');
  let finish!: (allowed: boolean) => void;
  (requestReminderPermission as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await render(<NotificationsSettings />);
  await fireEvent.press(await screen.findByText('Allow notifications'));
  await fireEvent.press(screen.getByText('Allow notifications'));
  expect(requestReminderPermission).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: /Allow notifications/ }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByLabelText('Requesting notification permission').props.accessibilityState.busy).toBe(true);
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
  await fireEvent.press(screen.getByText('Allow notifications'));
  await screen.findByText('Could not enable notifications. Try again or check your device Settings.');
  await act(async () => foreground('active'));
  await waitFor(() => expect(screen.queryByText('Could not read meal reminders. Return here to retry.')).toBeNull());
  expect(screen.getByText('1 configured')).toBeTruthy();
  subscription.mockRestore();
});

it('shows native platform build metadata when the legacy top-level build is absent', async () => {
  const priorBuild = Constants.nativeBuildVersion;
  const priorPlatform = Constants.platform;
  Constants.nativeBuildVersion = undefined;
  Constants.platform = { ios: { buildNumber: '123' } } as typeof Constants.platform;
  try {
    await render(<AboutSettings />);
    expect(screen.getByText('123')).toBeTruthy();
  } finally {
    Constants.nativeBuildVersion = priorBuild;
    Constants.platform = priorPlatform;
  }
});

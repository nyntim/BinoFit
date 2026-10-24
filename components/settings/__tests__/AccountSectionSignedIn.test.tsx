import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AccountSection, SIGN_OUT_TITLE, signOutWarning } from '@/components/settings/AccountSection';
import { canDeleteAccount, prepareSignOut, retryRestore } from '@/lib/auth';
import { getRestorePending } from '@/lib/storage';
import { syncToSupabase } from '@/lib/sync';

const mockAuth = { status: 'signedIn', email: 'tim@example.com', method: 'email' };
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => mockAuth }));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => 'gray' }));
jest.mock('@/hooks/useBackupStatus', () => ({ useBackupStatus: () => ({ text: 'Backed up just now', tone: 'success', lastSyncAt: 1 }) }));
jest.mock('@/hooks/useSyncStatus', () => ({ useSyncStatus: () => ({ state: { status: 'idle', isOffline: false } }) }));
jest.mock('@/lib/sync-status', () => ({ isSyncConfigured: () => true }));
jest.mock('@/lib/sync', () => ({ syncToSupabase: jest.fn() }));
jest.mock('@/lib/storage', () => ({ getRestorePending: jest.fn(async () => false) }));
jest.mock('@/components/settings/AppleSignInButton', () => ({ APPLE_SIGN_IN_SUPPORTED: false }));
jest.mock('@/lib/auth', () => ({
  canDeleteAccount: jest.fn(async () => false),
  getPendingAccountDeletion: jest.fn(async () => null),
  deleteAccountAndWipe: jest.fn(),
  removePendingDeletionDeviceData: jest.fn(),
  prepareSignOut: jest.fn(async () => ({ unsynced: 2 })),
  retryRestore: jest.fn(async () => ({ ok: true })),
  signInWithApple: jest.fn(),
  signOutAndWipe: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockAuth, { status: 'signedIn', email: 'tim@example.com', method: 'email' });
  (canDeleteAccount as jest.Mock).mockResolvedValue(false);
  (getRestorePending as jest.Mock).mockResolvedValue(false);
});

it('shows the email account card with its method, password change and the unchanged sign-out warning', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<AccountSection showTitle={false} />);
  expect(screen.getByText('tim@example.com')).toBeTruthy();
  expect(screen.getByText('Signed in with email')).toBeTruthy();
  expect(screen.getByText('Backed up just now')).toBeTruthy();
  await fireEvent.press(screen.getByText('Change password'));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/account', params: { mode: 'changePassword' } });
  await fireEvent.press(screen.getByText('Sign out'));
  await waitFor(() => expect(alert).toHaveBeenCalled());
  expect(prepareSignOut).toHaveBeenCalled();
  expect(alert.mock.calls.at(-1)?.[0]).toBe(SIGN_OUT_TITLE);
  expect(alert.mock.calls.at(-1)?.[1]).toBe(signOutWarning(2));
  expect(alert.mock.calls.at(-1)?.[2]?.map((button) => button.text)).toEqual(['Cancel', 'Sign Out']);
  expect(screen.getByText('Signing out removes your log from this phone. Your backup stays in your account.')).toBeTruthy();
  alert.mockRestore();
});

it('disables account deletion with its hint until the capability is verified', async () => {
  await render(<AccountSection showTitle={false} />);
  expect(await screen.findByText('Deletion is unavailable until the server capability is verified. Connect and retry.')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Delete account and backup/, disabled: true })).toBeTruthy();
  expect(screen.getByText('Deleting is permanent. Export your data first from Data and privacy.')).toBeTruthy();
});

it('enables deletion once the server capability is verified', async () => {
  (canDeleteAccount as jest.Mock).mockResolvedValue(true);
  await render(<AccountSection showTitle={false} />);
  await waitFor(() => expect(screen.getByRole('button', { name: /Delete account and backup/ }).props.accessibilityState.disabled).toBe(false));
});

it('Sync now starts a sync without waiting for it', async () => {
  let finish!: () => void;
  (syncToSupabase as jest.Mock).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  await render(<AccountSection showTitle={false} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Sync now' }));
  expect(syncToSupabase).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Sync now' })).toBeTruthy();
  finish();
});

it('an Apple account has no password change and says how it signed in', async () => {
  Object.assign(mockAuth, { method: 'apple' });
  await render(<AccountSection showTitle={false} />);
  expect(screen.getByText('Signed in with Apple')).toBeTruthy();
  expect(screen.queryByText('Change password')).toBeNull();
  expect(screen.getByText('Sign out')).toBeTruthy();
});

it('offers Restore data while a restore is pending and retries it', async () => {
  (getRestorePending as jest.Mock).mockResolvedValue(true);
  await render(<AccountSection showTitle={false} />);
  expect(await screen.findByText('Your data has not been restored.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Restore data' }));
  await waitFor(() => expect(retryRestore).toHaveBeenCalledTimes(1));
});

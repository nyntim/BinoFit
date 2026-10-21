import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AccountSection } from '@/components/settings/AccountSection';
import { canDeleteAccount, deleteAccountAndWipe, getPendingAccountDeletion, removePendingDeletionDeviceData } from '@/lib/auth';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ status: 'none', email: null, method: null }) }));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => 'gray' }));
jest.mock('@/lib/sync-status', () => ({ isSyncConfigured: () => true }));
jest.mock('@/lib/storage', () => ({ getRestorePending: jest.fn(async () => false) }));
jest.mock('@/components/settings/AppleSignInButton', () => ({ APPLE_SIGN_IN_SUPPORTED: false }));
jest.mock('@/lib/auth', () => ({
  canDeleteAccount: jest.fn(async () => false),
  getPendingAccountDeletion: jest.fn(async () => 'requested'),
  deleteAccountAndWipe: jest.fn(),
  removePendingDeletionDeviceData: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  (getPendingAccountDeletion as jest.Mock).mockResolvedValue('requested');
  (canDeleteAccount as jest.Mock).mockResolvedValue(false);
});

it('offers Finish deletion after token expiry even without a live capability', async () => {
  (deleteAccountAndWipe as jest.Mock).mockResolvedValue({ ok: false, message: 'Server confirmation unavailable. Device data kept.' });
  await render(<AccountSection />);
  await screen.findByText('Finish deletion');
  expect(screen.queryByText('Sign up with email')).toBeNull();
  await fireEvent.press(screen.getByText('Finish deletion'));
  await screen.findByText('Server confirmation unavailable. Device data kept.');
  expect(removePendingDeletionDeviceData).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
  expect(screen.getByText('Finish deletion')).toBeTruthy();
});

it('finishes confirmed local cleanup independently of capability or auth status', async () => {
  (getPendingAccountDeletion as jest.Mock).mockResolvedValue('confirmed');
  (deleteAccountAndWipe as jest.Mock).mockResolvedValue({ ok: true });
  await render(<AccountSection />);
  await screen.findByText('Finish deletion');
  expect(screen.queryByText('Remove device data only')).toBeNull();
  await fireEvent.press(screen.getByText('Finish deletion'));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding'));
});

it('requires explicit informed confirmation before removing unverified device data', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  (removePendingDeletionDeviceData as jest.Mock).mockResolvedValue({ ok: true });
  await render(<AccountSection />);
  await screen.findByText('Remove device data only');
  await fireEvent.press(screen.getByText('Remove device data only'));
  expect(alert.mock.calls[0][1]).toContain('Your account and cloud data may still exist');
  expect(removePendingDeletionDeviceData).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2]!;
  await act(async () => { buttons.find((button) => button.text === 'Remove device data only')!.onPress!(); });
  await waitFor(() => expect(removePendingDeletionDeviceData).toHaveBeenCalledTimes(1));
  alert.mockRestore();
});

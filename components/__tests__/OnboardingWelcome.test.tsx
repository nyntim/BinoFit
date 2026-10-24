// jest.mock factories are hoisted above imports, so they must require what they use.
/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import WelcomeScreen from '@/app/onboarding/index';
import { useAuth } from '@/hooks/useAuth';
import { retryRestore, signInWithApple } from '@/lib/auth';
import { getLoggedDates } from '@/lib/database';
import { getRestorePending, getUserGoals } from '@/lib/storage';
import { isSyncConfigured } from '@/lib/sync-status';
import { applyAuthRoute } from '@/components/auth/applyAuthRoute';
import { router, useLocalSearchParams } from 'expo-router';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => '#333333' }));
jest.mock('@/hooks/useAuth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/auth', () => ({ retryRestore: jest.fn(), signInWithApple: jest.fn() }));
jest.mock('@/lib/database', () => ({ getLoggedDates: jest.fn() }));
jest.mock('@/lib/storage', () => ({ getRestorePending: jest.fn(), getUserGoals: jest.fn() }));
jest.mock('@/lib/sync-status', () => ({ isSyncConfigured: jest.fn() }));
jest.mock('@/components/auth/applyAuthRoute', () => ({ applyAuthRoute: jest.fn() }));
jest.mock('@/components/settings/AppleSignInButton', () => {
  const { Pressable, Text } = require('react-native');
  return {
    APPLE_SIGN_IN_SUPPORTED: true,
    AppleSignInButton: ({ onPress }: { onPress: () => void }) => (
      <Pressable accessibilityRole="button" accessibilityLabel="Sign up with Apple" onPress={onPress}><Text>Apple</Text></Pressable>
    ),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  (useAuth as jest.Mock).mockReturnValue({ status: 'none', email: null, method: null });
  (isSyncConfigured as jest.Mock).mockReturnValue(true);
  (getRestorePending as jest.Mock).mockResolvedValue(false);
  (getUserGoals as jest.Mock).mockResolvedValue(null);
  (getLoggedDates as jest.Mock).mockResolvedValue([]);
});
afterEach(() => { cleanup(); });

const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));

test('the anonymous welcome offers email sign up, continuing without an account and sign in', async () => {
  await render(<WelcomeScreen />);
  expect(screen.getByText('Eat, train and watch it add up.')).toBeTruthy();
  await press('Sign up with email');
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/onboarding/account', params: { mode: 'signUp' } });
  await press('Already have an account? Sign in');
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/onboarding/account', params: { mode: 'signIn' } });
  await press('Continue without an account');
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/onboarding/goals', params: { restart: undefined } });
});

test('restart shows only Continue', async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ restart: '1' });
  await render(<WelcomeScreen />);
  expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  expect(screen.queryByText('Sign up with email')).toBeNull();
});

test('unconfigured sync shows only Continue', async () => {
  (isSyncConfigured as jest.Mock).mockReturnValue(false);
  await render(<WelcomeScreen />);
  expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  expect(screen.queryByText('Sign up with email')).toBeNull();
});

describe('signed in with a restore pending', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ status: 'signedIn', email: 'a@b.co', method: 'email' });
    (getRestorePending as jest.Mock).mockResolvedValue(true);
  });

  test('shows the restore layout without a start-fresh option', async () => {
    await render(<WelcomeScreen />);
    await waitFor(() => expect(screen.getByText('Welcome back')).toBeTruthy());
    expect(screen.getByText('We found a backup for a@b.co. Bring it onto this phone?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restore data' })).toBeTruthy();
    expect(screen.queryByText('Start fresh on this phone')).toBeNull();
  });

  test('Restore data retries the restore and reports a failure', async () => {
    (retryRestore as jest.Mock).mockResolvedValue({ ok: false });
    await render(<WelcomeScreen />);
    await waitFor(() => expect(getRestorePending).toHaveBeenCalled());
    await press('Restore data');
    expect(await screen.findByText('Signed in, but your data could not be restored.')).toBeTruthy();
    expect(retryRestore).toHaveBeenCalled();
    expect(signInWithApple).not.toHaveBeenCalled();
  });
});

test('signed in without a pending restore continues to the tabs when data exists', async () => {
  (useAuth as jest.Mock).mockReturnValue({ status: 'signedIn', email: 'a@b.co', method: 'email' });
  (getUserGoals as jest.Mock).mockResolvedValue({ calorie_goal: 2000 });
  await render(<WelcomeScreen />);
  await press('Continue');
  await waitFor(() => expect(applyAuthRoute).toHaveBeenCalledWith({ to: 'tabs', completeOnboarding: true }));
});

test('signed in with nothing saved continues to goals', async () => {
  (useAuth as jest.Mock).mockReturnValue({ status: 'signedIn', email: 'a@b.co', method: 'email' });
  await render(<WelcomeScreen />);
  await press('Continue');
  await waitFor(() => expect(applyAuthRoute).toHaveBeenCalledWith({ to: 'goals' }));
});

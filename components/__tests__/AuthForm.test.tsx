// jest.mock factories are hoisted above imports, so they must require what they use.
/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AuthForm } from '@/components/auth/AuthForm';
import { signInWithApple, signUpWithEmail } from '@/lib/auth';
import { emailError, passwordError } from '@/lib/auth-validation';

jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => '#333333' }));
jest.mock('@/lib/auth', () => ({
  changePassword: jest.fn(),
  requestPasswordReset: jest.fn(),
  resendEmailCode: jest.fn(),
  retryRestore: jest.fn(),
  signInWithApple: jest.fn(),
  signInWithEmail: jest.fn(),
  signUpWithEmail: jest.fn(),
  verifyEmailCode: jest.fn(),
  verifyPasswordReset: jest.fn(),
}));
jest.mock('@/components/settings/AppleSignInButton', () => {
  const { Pressable, Text } = require('react-native');
  return {
    APPLE_SIGN_IN_SUPPORTED: true,
    AppleSignInButton: ({ onPress, type }: { onPress: () => void; type: string }) => (
      <Pressable accessibilityRole="button" accessibilityLabel={`Apple ${type}`} onPress={onPress}><Text>Apple</Text></Pressable>
    ),
  };
});

const onRoute = jest.fn();

beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => { cleanup(); });

const form = (mode: 'signUp' | 'signIn' | 'resetRequest', context: 'onboarding' | 'settings' = 'onboarding') =>
  render(<AuthForm initialMode={mode} context={context} onRoute={onRoute} />);
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));

test('sign up shows its header and validation errors, which clear when typing', async () => {
  await form('signUp');
  expect(screen.getByRole('header', { name: 'Back up your log' })).toBeTruthy();
  await press('Create account');
  expect(screen.getByText(emailError('')!)).toBeTruthy();
  expect(screen.getByText(passwordError('')!)).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.co');
  expect(screen.queryByText(emailError('')!)).toBeNull();
  expect(screen.getByText(passwordError('')!)).toBeTruthy();
});

test('the reveal button toggles its label', async () => {
  await form('signUp');
  await press('Show password');
  expect(screen.getByRole('button', { name: 'Hide password' })).toBeTruthy();
  expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
});

test('sign in links to reset and back to sign up', async () => {
  await form('signIn');
  expect(screen.getByRole('header', { name: 'Welcome back' })).toBeTruthy();
  await press('Forgot password?');
  expect(screen.getByRole('header', { name: 'Reset password' })).toBeTruthy();
  await press('Back to sign in');
  await press('New here? Create an account');
  expect(screen.getByRole('header', { name: 'Back up your log' })).toBeTruthy();
  await press('Already have an account? Sign in');
  expect(screen.getByRole('header', { name: 'Welcome back' })).toBeTruthy();
});

test('Apple continues from sign up', async () => {
  (signInWithApple as jest.Mock).mockResolvedValue({ status: 'cancelled' });
  await form('signUp');
  await press('Apple continue');
  await waitFor(() => expect(signInWithApple).toHaveBeenCalledTimes(1));
});

test('Apple is offered on sign in', async () => {
  await form('signIn');
  expect(screen.getByRole('button', { name: 'Apple signIn' })).toBeTruthy();
});

test('Apple is not offered when resetting a password', async () => {
  await form('resetRequest');
  expect(screen.queryByRole('button', { name: /^Apple/ })).toBeNull();
});

test('settings sign up success routes back', async () => {
  (signUpWithEmail as jest.Mock).mockResolvedValue({ status: 'signedUp' });
  await form('signUp', 'settings');
  await fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.co');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'longenough1');
  await press('Create account');
  await waitFor(() => expect(onRoute).toHaveBeenCalledWith({ to: 'back' }));
});

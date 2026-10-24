// jest.mock factories are hoisted above imports, so they must require what they use.
/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import CompleteScreen from '@/app/onboarding/complete';
import { getUserGoals, setOnboardingComplete } from '@/lib/storage';
import { homeRouteFor } from '@/lib/tracking-mode';
import { router } from 'expo-router';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => '#333333' }));
jest.mock('@/lib/database', () => ({ getDatabase: jest.fn(() => Promise.resolve()) }));
jest.mock('@/lib/storage', () => ({ getUserGoals: jest.fn(), setOnboardingComplete: jest.fn() }));

const order: string[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  order.length = 0;
  (getUserGoals as jest.Mock).mockResolvedValue({ calorie_goal: 2250, protein_goal: 169, carb_goal: 253, fat_goal: 63 });
  (setOnboardingComplete as jest.Mock).mockImplementation(async () => { order.push('complete'); });
  (router.replace as jest.Mock).mockImplementation(() => { order.push('replace'); });
});
afterEach(() => { cleanup(); });

const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));

test('shows the saved calories and protein as chips', async () => {
  await render(<CompleteScreen />);
  expect(await screen.findByLabelText('2,250 calories a day')).toBeTruthy();
  expect(screen.getByLabelText('169 grams of protein')).toBeTruthy();
});

test('shows no chips without saved goals', async () => {
  (getUserGoals as jest.Mock).mockResolvedValue(null);
  await render(<CompleteScreen />);
  await waitFor(() => expect(getUserGoals).toHaveBeenCalled());
  expect(screen.queryByLabelText(/calories a day/)).toBeNull();
  expect(screen.queryByLabelText(/grams of protein/)).toBeNull();
});

test('Go to Today completes onboarding then replaces with home', async () => {
  await render(<CompleteScreen />);
  await press('Go to Today');
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith(homeRouteFor()));
  expect(order).toEqual(['complete', 'replace']);
  expect(router.push).not.toHaveBeenCalled();
});

test('a failed completion shows an alert and stays', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  (setOnboardingComplete as jest.Mock).mockRejectedValueOnce(new Error('disk'));
  await render(<CompleteScreen />);
  await press('Go to Today');
  await waitFor(() => expect(alert).toHaveBeenCalledWith('Could not finish setup', 'Try again.'));
  expect(router.replace).not.toHaveBeenCalled();
  alert.mockRestore();
});

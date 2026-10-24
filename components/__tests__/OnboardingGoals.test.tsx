// jest.mock factories are hoisted above imports, so they must require what they use.
/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import GoalsScreen from '@/app/onboarding/goals';
import { usePreferences } from '@/hooks/usePreferences';
import { getUserGoals, getUserProfile, saveUserGoals, saveUserProfile } from '@/lib/storage';
import { syncToSupabase } from '@/lib/sync';
import { getLatestWeightEntry, saveWeightEntry, weightRangeMessage } from '@/lib/weight';
import { router, useLocalSearchParams } from 'expo-router';

jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
    Stack: { Screen: () => null },
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
    useLocalSearchParams: jest.fn(() => ({})),
  };
});
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => '#333333' }));
jest.mock('@/hooks/usePreferences', () => ({ usePreferences: jest.fn(() => ({ weightUnit: 'lb' })) }));
jest.mock('@/lib/app-preferences', () => ({ setWeightUnit: jest.fn(() => Promise.resolve()) }));
jest.mock('@/lib/storage', () => ({
  getUserGoals: jest.fn(),
  getUserProfile: jest.fn(),
  saveUserGoals: jest.fn(),
  saveUserProfile: jest.fn(),
}));
jest.mock('@/lib/sync', () => ({ syncToSupabase: jest.fn() }));
jest.mock('@/lib/weight', () => ({
  ...jest.requireActual('@/lib/weight'),
  getLatestWeightEntry: jest.fn(),
  saveWeightEntry: jest.fn(),
}));

const calls: string[] = [];

function setPreferences(weightUnit: 'lb' | 'kg') {
  (usePreferences as jest.Mock).mockReturnValue({ weightUnit });
}

beforeEach(() => {
  jest.clearAllMocks();
  calls.length = 0;
  setPreferences('lb');
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  (router.canGoBack as jest.Mock).mockReturnValue(true);
  (getUserGoals as jest.Mock).mockResolvedValue(null);
  (getUserProfile as jest.Mock).mockResolvedValue(null);
  (getLatestWeightEntry as jest.Mock).mockResolvedValue(null);
  (saveUserGoals as jest.Mock).mockImplementation(async () => { calls.push('goals'); });
  (saveUserProfile as jest.Mock).mockImplementation(async () => { calls.push('profile'); });
  (saveWeightEntry as jest.Mock).mockImplementation(async () => { calls.push('weight'); });
});
afterEach(() => { cleanup(); });

async function renderReady() {
  await render(<GoalsScreen />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityState.disabled).toBe(false));
}

const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));

test('Continue goes to Daily targets and Back returns without leaving setup', async () => {
  await renderReady();
  expect(screen.getByText('A little about you')).toBeTruthy();
  await press('Continue');
  expect(screen.getByText('Your daily targets')).toBeTruthy();
  await press('Back');
  expect(screen.getByText('A little about you')).toBeTruthy();
  expect(router.back).not.toHaveBeenCalled();
  await press('Back');
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('an invalid weight shows the range message and stays on About you', async () => {
  await renderReady();
  await fireEvent.changeText(screen.getByLabelText('Weight in lb'), '5');
  await press('Continue');
  expect(screen.getByText(weightRangeMessage('lb'))).toBeTruthy();
  expect(screen.getByText('A little about you')).toBeTruthy();
});

test('Skip goes to targets and saves the loaded profile, not the typed weight', async () => {
  (getUserProfile as jest.Mock).mockResolvedValue({ weight: 80, height: 180, activity_level: 'active', updated_at: 'x' });
  (getLatestWeightEntry as jest.Mock).mockResolvedValue({ weight_kg: 80 });
  await renderReady();
  await fireEvent.changeText(screen.getByLabelText('Weight in lb'), '150');
  await press('Skip');
  expect(screen.getByText('Your daily targets')).toBeTruthy();
  await press('Save targets');
  await waitFor(() => expect(router.push).toHaveBeenCalled());
  expect(saveUserProfile).toHaveBeenCalledWith({ weight: 80, height: 180, activity_level: 'active' });
  expect(saveWeightEntry).not.toHaveBeenCalled();
});

test('blank calories show the inline error and save nothing', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  await renderReady();
  await press('Continue');
  await fireEvent.changeText(screen.getByLabelText('Calories per day'), '');
  await press('Save targets');
  expect(screen.getByText('Please fill in all calorie and macro goals.')).toBeTruthy();
  expect(saveUserGoals).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();
});

test('a full save writes goals, profile and a changed weight in order, syncs and continues', async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ restart: '1' });
  await renderReady();
  await fireEvent.changeText(screen.getByLabelText('Weight in lb'), '165');
  await press('Continue');
  await press('Save targets');
  await waitFor(() => expect(router.push).toHaveBeenCalled());
  expect(calls).toEqual(['goals', 'profile', 'weight']);
  expect(saveUserGoals).toHaveBeenCalledWith({ calorie_goal: 2000, protein_goal: 150, carb_goal: 200, fat_goal: 65 });
  expect(saveWeightEntry).toHaveBeenCalledWith({ weight_kg: expect.closeTo(74.84, 1) });
  expect(syncToSupabase).toHaveBeenCalled();
  expect(router.push).toHaveBeenCalledWith({ pathname: '/onboarding/complete', params: { restart: '1' } });
});

test('restart with nothing changed skips the profile and weight writes', async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ restart: '1' });
  (getUserGoals as jest.Mock).mockResolvedValue({ calorie_goal: 2200, protein_goal: 160, carb_goal: 220, fat_goal: 70 });
  (getUserProfile as jest.Mock).mockResolvedValue({ weight: 80, height: 180, activity_level: 'light', updated_at: 'x' });
  (getLatestWeightEntry as jest.Mock).mockResolvedValue({ weight_kg: 80 });
  await renderReady();
  await press('Continue');
  await press('Save targets');
  await waitFor(() => expect(router.push).toHaveBeenCalled());
  expect(saveUserGoals).toHaveBeenCalledWith({ calorie_goal: 2200, protein_goal: 160, carb_goal: 220, fat_goal: 70 });
  expect(saveUserProfile).not.toHaveBeenCalled();
  expect(saveWeightEntry).not.toHaveBeenCalled();
});

test('changing the unit keeps typed targets and converts the weight', async () => {
  const { rerender } = await render(<GoalsScreen />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityState.disabled).toBe(false));
  await fireEvent.changeText(screen.getByLabelText('Weight in lb'), '165');
  await press('Continue');
  await fireEvent.changeText(screen.getByLabelText('Calories per day'), '2400');
  await press('Back');
  setPreferences('kg');
  await act(async () => { rerender(<GoalsScreen />); });
  expect(screen.getByLabelText('Weight in kg').props.value).toBe('74.84');
  await press('Continue');
  expect(screen.getByLabelText('Calories per day').props.value).toBe('2400');
});

test('activity rows are radios with a checked state and the macro caption follows the grams', async () => {
  await renderReady();
  const moderate = screen.getByRole('radio', { name: /^Moderate/ });
  expect(moderate.props.accessibilityState.checked).toBe(true);
  await fireEvent.press(screen.getByRole('radio', { name: /^Sedentary/ }));
  expect(screen.getByRole('radio', { name: /^Sedentary/ }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByRole('radio', { name: /^Moderate/ }).props.accessibilityState.checked).toBe(false);
  await press('Continue');
  expect(screen.getByText('30% of calories')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Protein grams'), '100');
  expect(screen.getByText('20% of calories')).toBeTruthy();
});

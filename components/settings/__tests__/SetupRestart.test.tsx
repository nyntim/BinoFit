import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import GoalsScreen from '@/app/onboarding/goals';
import { getLatestWeightEntry, saveWeightEntry } from '@/lib/weight';
import { getUserProfile, saveUserGoals, saveUserProfile } from '@/lib/storage';
import { router } from 'expo-router';
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => 'gray' }));
let mockUnit = 'lb';
jest.mock('@/hooks/usePreferences', () => ({ usePreferences: () => ({ weightUnit: mockUnit }) }));
jest.mock('@/lib/app-preferences', () => ({ setWeightUnit: jest.fn(async () => {}) }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({ restart: '1' }),
}));
jest.mock('@/lib/storage', () => ({
  getUserGoals: jest.fn(async () => ({ calorie_goal: 2345, protein_goal: 140, carb_goal: 230, fat_goal: 75 })),
  getUserProfile: jest.fn(async () => ({ weight: 72.123, height: 173.4, activity_level: 'light' })),
  saveUserGoals: jest.fn(async () => {}), saveUserProfile: jest.fn(async () => {}),
}));
jest.mock('@/lib/weight', () => ({
  getLatestWeightEntry: jest.fn(async () => ({ weight_kg: 72.123 })),
  weightInputToKg: jest.requireActual('@/lib/weight').weightInputToKg,
  weightRangeMessage: jest.fn(() => 'Enter a valid weight.'), saveWeightEntry: jest.fn(),
}));
jest.mock('@/lib/sync', () => ({ syncToSupabase: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); mockUnit = 'lb'; });
// Setup is two steps: About you, then Daily targets. Save from the second.
async function save() {
  await fireEvent.press(screen.getByText('Continue'));
  await fireEvent.press(screen.getByText('Save targets'));
}
it('prefills existing setup and preserves canonical weight without adding a weigh-in', async () => {
  mockUnit = 'kg';
  await render(<GoalsScreen />);
  expect(await screen.findByDisplayValue('173.4')).toBeTruthy();
  await fireEvent.press(screen.getByText('Continue'));
  expect(screen.getByDisplayValue('2345')).toBeTruthy();
  await fireEvent.press(screen.getByText('Save targets'));
  await waitFor(() => expect(saveUserGoals).toHaveBeenCalledWith({ calorie_goal: 2345, protein_goal: 140, carb_goal: 230, fat_goal: 75 }));
  expect(saveUserProfile).not.toHaveBeenCalled();
  expect(saveWeightEntry).not.toHaveBeenCalled();
  expect(router.push).toHaveBeenCalledWith({ pathname: '/onboarding/complete', params: { restart: '1' } });
});

it.each([null, { weight: null, height: null, activity_level: null }])('preserves an absent or nullable profile on unchanged restart: %j', async (profile) => {
  (getUserProfile as jest.Mock).mockResolvedValueOnce(profile);
  (getLatestWeightEntry as jest.Mock).mockResolvedValueOnce(null);
  await render(<GoalsScreen />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityState.disabled).toBe(false));
  await save();
  await waitFor(() => expect(router.push).toHaveBeenCalled());
  expect(saveUserProfile).not.toHaveBeenCalled();
  expect(saveWeightEntry).not.toHaveBeenCalled();
});
it('keeps nullable activity when another profile field is edited', async () => {
  mockUnit = 'kg';
  (getUserProfile as jest.Mock).mockResolvedValueOnce({ weight: null, height: 170, activity_level: null });
  (getLatestWeightEntry as jest.Mock).mockResolvedValueOnce(null);
  await render(<GoalsScreen />);
  await fireEvent.changeText(await screen.findByDisplayValue('170'), '175');
  await save();
  await waitFor(() => expect(saveUserProfile).toHaveBeenCalledWith({ weight: null, height: 175, activity_level: null }));
});

it.each([[20, '44.09'], [400, '881.85']])('continues unchanged restart at %s kg despite rounded pounds', async (kg, pounds) => {
  (getUserProfile as jest.Mock).mockResolvedValueOnce({ weight: kg, height: null, activity_level: null });
  (getLatestWeightEntry as jest.Mock).mockResolvedValueOnce({ weight_kg: kg });
  await render(<GoalsScreen />);
  await screen.findByDisplayValue(String(pounds));
  await save();
  await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: '/onboarding/complete', params: { restart: '1' } }));
  expect(saveUserProfile).not.toHaveBeenCalled();
  expect(saveWeightEntry).not.toHaveBeenCalled();
});
it.each([[20, '44.09', '40'], [400, '881.85', '900']])('still rejects an edited weight outside the valid bounds from %s kg', async (kg, pounds, edited) => {
  (getUserProfile as jest.Mock).mockResolvedValueOnce({ weight: kg, height: null, activity_level: null });
  (getLatestWeightEntry as jest.Mock).mockResolvedValueOnce({ weight_kg: kg });
  await render(<GoalsScreen />);
  await fireEvent.changeText(await screen.findByDisplayValue(String(pounds)), String(edited));
  await fireEvent.press(screen.getByText('Continue'));
  expect(screen.getByText('Enter a valid weight.')).toBeTruthy();
  expect(router.push).not.toHaveBeenCalled();
  expect(saveUserGoals).not.toHaveBeenCalled();
  expect(saveWeightEntry).not.toHaveBeenCalled();
});

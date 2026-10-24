import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import NutritionSettings from '@/app/settings/nutrition';
import { getUserGoals, saveUserGoals } from '@/lib/storage';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useNavigation: () => ({ dispatch: jest.fn(), getState: () => ({}), getParent: () => undefined }) }));
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => 'gray' }));
jest.mock('@/hooks/useMealDefinitions', () => ({
  useMealDefinitions: () => ({
    defs: [{ id: 'a', position: 0, reminder_time: null, calorie_target: 500 }],
    names: [{ meal_id: 'a', name: 'Breakfast', effective_from: '0000-01-01' }],
  }),
}));
jest.mock('@/lib/storage', () => ({ getUserGoals: jest.fn(), saveUserGoals: jest.fn() }));
jest.mock('@/lib/sync', () => ({ syncToSupabase: jest.fn() }));

const goals = { calorie_goal: 2000, protein_goal: 150, carb_goal: 200, fat_goal: 65, updated_at: 'x' };
beforeEach(() => { jest.clearAllMocks(); (getUserGoals as jest.Mock).mockResolvedValue(goals); (saveUserGoals as jest.Mock).mockResolvedValue(undefined); });

test('the sticky footer counts invalid fields, disables Save goals and confirms a save', async () => {
  await render(<NutritionSettings />);
  await screen.findByDisplayValue('2000');
  expect(screen.getByText('Breakfast')).toBeTruthy();
  expect(screen.getByText('No reminder · 500 cal')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Calories'), '');
  expect(await screen.findByText('Fix 1 field to save')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save goals', disabled: true })).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Calories'), '2100');
  await waitFor(() => expect(screen.queryByText('Fix 1 field to save')).toBeNull());
  await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'Save goals' })); });
  await waitFor(() => expect(saveUserGoals).toHaveBeenCalledWith(expect.objectContaining({ calorie_goal: 2100 })));
  expect(await screen.findByText('Goals saved')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Calories'), '2200');
  await waitFor(() => expect(screen.queryByText('Goals saved')).toBeNull());
});

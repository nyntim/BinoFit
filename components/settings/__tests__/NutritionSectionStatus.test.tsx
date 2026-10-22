import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NutritionSection } from '@/components/settings/NutritionSection';
import { getDefaultLogStatus, getUserGoals, saveUserGoals, setDefaultLogStatus } from '@/lib/storage';

jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => '#333333' }));
jest.mock('@/lib/storage', () => ({
  getUserGoals: jest.fn(), getDefaultLogStatus: jest.fn(), saveUserGoals: jest.fn(), setDefaultLogStatus: jest.fn(),
}));
jest.mock('@/lib/sync', () => ({ syncToSupabase: jest.fn() }));
const goals = { calorie_goal: 2000, protein_goal: 150, carb_goal: 200, fat_goal: 65, updated_at: 'x' };
const mockGoals = getUserGoals as jest.Mock;
const mockStatus = getDefaultLogStatus as jest.Mock;
const mockSave = saveUserGoals as jest.Mock;
const mockDefault = setDefaultLogStatus as jest.Mock;

afterEach(async () => { await cleanup(); });

beforeEach(() => {
  jest.clearAllMocks();
  mockGoals.mockResolvedValue(goals);
  mockStatus.mockResolvedValue('eaten');
  mockSave.mockResolvedValue(undefined);
  mockDefault.mockResolvedValue(undefined);
});

test('goals load independently of food status and the moved control is absent', async () => {
  mockStatus.mockRejectedValueOnce(new Error('disk'));
  await render(<NutritionSection onManageReminders={() => {}} />);
  await screen.findByDisplayValue('2000');
  expect(mockStatus).not.toHaveBeenCalled();
  expect(screen.queryByText('Default for new food')).toBeNull();
  expect(screen.queryByRole('radio')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Calories'), '2100');
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ calorie_goal: 2100 })));
  expect(mockDefault).not.toHaveBeenCalled();
});

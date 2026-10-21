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

test('default status is stored immediately and failures are visible', async () => {
  mockDefault.mockRejectedValueOnce(new Error('disk'));
  await render(<NutritionSection onManageReminders={() => {}} />);
  await screen.findByDisplayValue('2000');
  await fireEvent.press(screen.getByText('Planned'));
  await waitFor(() => expect(screen.getByText('Couldn’t save the food default. Try again.')).toBeTruthy());
  expect(mockDefault).toHaveBeenCalledWith('planned');
});

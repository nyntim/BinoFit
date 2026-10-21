import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { NutritionSection, type NutritionSectionHandle } from '@/components/settings/NutritionSection';
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

test('failed save remains available to retry before close', async () => {
  const ref = createRef<NutritionSectionHandle>();
  mockSave.mockRejectedValueOnce(new Error('disk')).mockResolvedValueOnce(undefined);
  await render(<NutritionSection ref={ref} onManageReminders={() => {}} />);
  await screen.findByDisplayValue('2000');
  await fireEvent.changeText(screen.getByLabelText('Calories'), '2200');
  await act(async () => { expect(await ref.current?.flush()).toBe(false); });
  await screen.findByText('Couldn’t save goals. Your changes are still here. Try again.');
  await act(async () => { expect(await ref.current?.flush()).toBe(true); });
  expect(mockSave).toHaveBeenCalledTimes(2);
});


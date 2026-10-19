import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { NutritionSection, type NutritionSectionHandle } from '@/components/settings/NutritionSection';
import { getDefaultLogStatus, getUserGoals, saveUserGoals, setDefaultLogStatus } from '@/lib/storage';
import { syncToSupabase } from '@/lib/sync';

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

test('hydration reads settings without writing and reopening reads again', async () => {
  await render(<NutritionSection onManageReminders={() => {}} />);
  await screen.findByDisplayValue('2000');
  expect(mockSave).not.toHaveBeenCalled();
});

test('flush persists valid fields while invalid drafts keep prior values', async () => {
  const ref = createRef<NutritionSectionHandle>();
  const changed = jest.fn();
  await render(<NutritionSection ref={ref} onGoalsChanged={changed} onManageReminders={() => {}} />);
  await screen.findByDisplayValue('2000');
  fireEvent.changeText(screen.getByLabelText('Calories'), '');
  fireEvent.changeText(screen.getByLabelText('Protein (g)'), '160');
  await act(async () => { expect(await ref.current?.flush()).toBe(true); });
  expect(mockSave).toHaveBeenCalledWith({ calorie_goal: 2000, protein_goal: 160, carb_goal: 200, fat_goal: 65 });
  expect(changed).toHaveBeenCalledWith(expect.objectContaining({ protein_goal: 160 }));
  expect(syncToSupabase).toHaveBeenCalledTimes(1);
});


import React, { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { NutritionSection, type NutritionSectionHandle } from '@/components/settings/NutritionSection';
import { getDefaultLogStatus, getUserGoals, saveUserGoals } from '@/lib/storage';

jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => '#333333' }));
jest.mock('@/lib/storage', () => ({
  getUserGoals: jest.fn(), getDefaultLogStatus: jest.fn(), saveUserGoals: jest.fn(), setDefaultLogStatus: jest.fn(),
}));
jest.mock('@/lib/sync', () => ({ syncToSupabase: jest.fn() }));

test('reverting a failed goal edit to its persisted value permits dismissal', async () => {
  (getUserGoals as jest.Mock).mockResolvedValue({ calorie_goal: 2000, protein_goal: 150, carb_goal: 200, fat_goal: 65, updated_at: 'x' });
  (getDefaultLogStatus as jest.Mock).mockResolvedValue('eaten');
  (saveUserGoals as jest.Mock).mockRejectedValueOnce(new Error('disk'));
  const ref = createRef<NutritionSectionHandle>();
  await render(<NutritionSection ref={ref} onManageReminders={() => {}} />);
  await screen.findByDisplayValue('2000');
  fireEvent.changeText(screen.getByLabelText('Calories'), '2200');
  await act(async () => { expect(await ref.current?.flush()).toBe(false); });
  fireEvent.changeText(screen.getByLabelText('Calories'), '2000');
  await act(async () => { expect(await ref.current?.flush()).toBe(true); });
  expect(saveUserGoals).toHaveBeenCalledTimes(1);
});

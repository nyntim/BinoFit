import React, { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { NutritionSection, type NutritionSectionHandle } from '@/components/settings/NutritionSection';
import { getDefaultLogStatus, getUserGoals, saveUserGoals } from '@/lib/storage';

jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => '#333333' }));
jest.mock('@/lib/storage', () => ({
  getUserGoals: jest.fn(), getDefaultLogStatus: jest.fn(), saveUserGoals: jest.fn(), setDefaultLogStatus: jest.fn(),
}));
jest.mock('@/lib/sync', () => ({ syncToSupabase: jest.fn() }));

test('close persists a reverted value after an earlier queued save completes', async () => {
  (getUserGoals as jest.Mock).mockResolvedValue({ calorie_goal: 2000, protein_goal: 150, carb_goal: 200, fat_goal: 65, updated_at: 'x' });
  (getDefaultLogStatus as jest.Mock).mockResolvedValue('eaten');
  let release!: () => void;
  const pendingSave = new Promise<void>((resolve) => { release = resolve; });
  (saveUserGoals as jest.Mock).mockImplementationOnce(() => pendingSave).mockResolvedValue(undefined);
  const ref = createRef<NutritionSectionHandle>();
  await render(<NutritionSection ref={ref} onManageReminders={() => {}} />);
  await screen.findByDisplayValue('2000');
  fireEvent.changeText(screen.getByLabelText('Calories'), '2200');
  fireEvent(screen.getByLabelText('Calories'), 'blur');
  await act(async () => { await Promise.resolve(); });
  expect(saveUserGoals).toHaveBeenCalledWith(expect.objectContaining({ calorie_goal: 2200 }));
  fireEvent.changeText(screen.getByLabelText('Calories'), '2000');
  const closing = ref.current?.flush();
  await act(async () => { release(); expect(await closing).toBe(true); });
  expect(saveUserGoals).toHaveBeenLastCalledWith(expect.objectContaining({ calorie_goal: 2000 }));
});

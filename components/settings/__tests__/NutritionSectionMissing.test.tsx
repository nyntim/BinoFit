import React, { createRef } from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { NutritionSection, type NutritionSectionHandle } from '@/components/settings/NutritionSection';
import { getDefaultLogStatus, getUserGoals, saveUserGoals } from '@/lib/storage';

jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => '#333333' }));
jest.mock('@/lib/storage', () => ({
  getUserGoals: jest.fn(), getDefaultLogStatus: jest.fn(), saveUserGoals: jest.fn(), setDefaultLogStatus: jest.fn(),
}));
jest.mock('@/lib/sync', () => ({ syncToSupabase: jest.fn() }));

test.each([null, new Error('read failed')])('a missing or unreadable goal record never writes fabricated defaults (%s)', async (value) => {
  if (value instanceof Error) (getUserGoals as jest.Mock).mockRejectedValue(value);
  else (getUserGoals as jest.Mock).mockResolvedValue(value);
  (getDefaultLogStatus as jest.Mock).mockResolvedValue('eaten');
  const ref = createRef<NutritionSectionHandle>();
  await render(<NutritionSection ref={ref} onManageReminders={() => {}} />);
  await screen.findByText(/Couldn’t load settings/);
  await act(async () => { expect(await ref.current?.flush()).toBe(false); });
  expect(saveUserGoals).not.toHaveBeenCalled();
});

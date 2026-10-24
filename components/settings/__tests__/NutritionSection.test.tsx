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

test('an invalid field prevents every goal write and keeps the draft', async () => {
  const ref = createRef<NutritionSectionHandle>();
  const changed = jest.fn();
  await render(<NutritionSection ref={ref} onGoalsChanged={changed} onManageReminders={() => {}} />);
  await screen.findByDisplayValue('2000');
  await fireEvent.changeText(screen.getByLabelText('Calories'), '');
  await fireEvent.changeText(screen.getByLabelText('Protein (g)'), '160');
  await act(async () => { expect(await ref.current?.flush()).toBe(false); });
  expect(mockSave).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue('160')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Calories'), '2200');
  await act(async () => { expect(await ref.current?.flush()).toBe(true); });
  expect(mockSave).toHaveBeenCalledWith({ calorie_goal: 2200, protein_goal: 160, carb_goal: 200, fat_goal: 65 });
  expect(syncToSupabase).toHaveBeenCalledTimes(1);
});

test('an invalid field shows its inline error and clears when fixed', async () => {
  await render(<NutritionSection onManageReminders={() => {}} />);
  await screen.findByDisplayValue('2000');
  await fireEvent.changeText(screen.getByLabelText('Protein (g)'), '25o');
  expect(screen.getByText('Enter a whole number, like 250.')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Calories'), '');
  expect(screen.getByText('Enter a whole number, like 2000.')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Protein (g)'), '250');
  await fireEvent.changeText(screen.getByLabelText('Calories'), '2000');
  expect(screen.queryByText(/Enter a whole number/)).toBeNull();
});

test('onFormStateChange reports the invalid field count', async () => {
  const onState = jest.fn();
  await render(<NutritionSection onManageReminders={() => {}} onFormStateChange={onState} />);
  await screen.findByDisplayValue('2000');
  expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ invalidCount: 0, dirty: false }));
  await fireEvent.changeText(screen.getByLabelText('Protein (g)'), 'x');
  await fireEvent.changeText(screen.getByLabelText('Fat (g)'), '');
  expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ invalidCount: 2, dirty: true }));
});

test('the energy split describes only valid macros', async () => {
  await render(<NutritionSection onManageReminders={() => {}} />);
  await screen.findByDisplayValue('2000');
  expect(screen.getByLabelText('Energy split: Protein 30%, Carbs 40%, Fat 29% of calories')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Carbs (g)'), 'abc');
  expect(screen.getByLabelText('Energy split: Protein 30%, Fat 29% of calories')).toBeTruthy();
});

test('inline actions save goals, and actions none leaves saving to the caller', async () => {
  const view = await render(<NutritionSection onManageReminders={() => {}} />);
  await screen.findByDisplayValue('2000');
  expect(screen.getByRole('button', { name: 'Save goals' })).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Calories'), '');
  expect(screen.getByRole('button', { name: 'Save goals', disabled: true })).toBeTruthy();
  await view.unmount();
  await render(<NutritionSection actions="none" onManageReminders={() => {}} />);
  await screen.findByDisplayValue('2000');
  expect(screen.queryByText('Save goals')).toBeNull();
});

test('meal rows list each meal above the manage row', async () => {
  const manage = jest.fn();
  await render(<NutritionSection onManageReminders={manage} mealRows={[{ id: 'a', name: 'Breakfast', detail: '7:30 AM · 500 cal' }]} />);
  await screen.findByDisplayValue('2000');
  expect(screen.getByText('Breakfast')).toBeTruthy();
  expect(screen.getByText('7:30 AM · 500 cal')).toBeTruthy();
  await fireEvent.press(screen.getByText('Manage meals and reminders'));
  expect(manage).toHaveBeenCalledTimes(1);
});

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import CustomFoodScreen from '@/app/custom-food';
import ServingPickerScreen from '@/app/serving-picker';
import { addCustomFood, addFoodLog, updateFoodLog, getFoodLogsWithFoodByDate } from '@/lib/database';

let mockParams: Record<string, string>;
const mockRouter = { back: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => mockRouter }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => '#333333' }));
jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'light' }));
jest.mock('@/hooks/useMealDefinitions', () => ({ useMealDefinitions: () => ({ loaded: true, labelFor: () => 'Lunch' }) }));
jest.mock('@/components/time-picker-sheet', () => ({ TimePickerSheet: () => null }));
jest.mock('@/lib/database', () => ({
  addCustomFood: jest.fn(), addFoodLog: jest.fn(), updateFoodLog: jest.fn(),
  getFoodById: jest.fn(async () => ({ id: 'food', name: 'Food', serving_units: '100g', calories: 100, protein: 10, carbs: 20, fat: 5, source: 'custom' })),
  getFoodLogsWithFoodByDate: jest.fn(), hasAnyMicros: () => false,
  getMealSlotConfirmationsByDate: jest.fn(async () => []), ensureMealSlotStatus: jest.fn(async () => true),
}));
jest.mock('@/lib/storage', () => ({ getUserGoals: async () => null, getDefaultLogStatus: async () => 'eaten' }));
jest.mock('@/lib/auth', () => ({ getSessionUserId: async () => null }));
jest.mock('@/lib/food-service', () => ({ saveCustomFoodToSupabase: jest.fn() }));
jest.mock('@/lib/foods-db', () => ({ getUSDAFoodById: jest.fn() }));

afterEach(async () => { await cleanup(); });
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { food_id: 'food', meal_slot: 'lunch', date: '2026-10-20' };
  (getFoodLogsWithFoodByDate as jest.Mock).mockResolvedValue([]);
  (addCustomFood as jest.Mock).mockResolvedValue({ id: 'new' });
  (addFoodLog as jest.Mock).mockResolvedValue(undefined);
});

async function fillCustom() {
  await fireEvent.changeText(screen.getByLabelText('Name (required)'), ' Yogurt ');
  await fireEvent.changeText(screen.getByLabelText('Serving size (required)'), ' 1 cup (240g) ');
  await fireEvent.changeText(screen.getByLabelText('Calories (required)'), '0');
}

test('custom food keeps pristine fields quiet, explains malformed macros, and saves zero blanks', async () => {
  await render(<CustomFoodScreen />);
  expect(screen.queryByText('Enter calories.')).toBeNull();
  await fireEvent(screen.getByLabelText('Calories (required)'), 'blur');
  expect(screen.getByText('Enter calories.')).toBeTruthy();
  await fillCustom();
  await fireEvent.changeText(screen.getByLabelText('Protein (g)'), '-5');
  expect(screen.getByText('Protein: enter a finite number of 0 or more.')).toBeTruthy();
  expect(screen.getByLabelText('Save food').props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByLabelText('Save food'));
  expect(addCustomFood).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Protein (g)'), '1,5');
  await fireEvent.press(screen.getByLabelText('Save food'));
  await waitFor(() => expect(addCustomFood).toHaveBeenCalledWith(expect.objectContaining({ name: 'Yogurt', serving_units: '1 cup (240g)', calories: 0, protein: 1.5, carbs: 0, fat: 0 })));
});

test('custom food blocks repeat writes while saving', async () => {
  await render(<CustomFoodScreen />);
  await fillCustom();
  await fireEvent.press(screen.getByLabelText('Save food'));
  await fireEvent.press(screen.getByLabelText('Save food'));
  expect(addCustomFood).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Save food').props.accessibilityState.busy).toBe(true);
});

test('untrusted initial amount stays visible and correction saves the canonical multiplier', async () => {
  mockParams.initial_amount = '-5';
  await render(<ServingPickerScreen />);
  const amount = await screen.findByLabelText('Amount, in servings');
  expect(amount.props.value).toBe('-5');
  expect(screen.getByText('Enter a valid nonnegative number.')).toBeTruthy();
  expect(screen.getByLabelText('Log to Lunch').props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByLabelText('Log to Lunch'));
  expect(addFoodLog).not.toHaveBeenCalled();
  await fireEvent.changeText(amount, '2.5');
  await fireEvent.press(screen.getByLabelText('Log to Lunch'));
  await waitFor(() => expect(addFoodLog).toHaveBeenCalledWith(expect.objectContaining({ serving_amount: 2.5, serving_unit: '100g' })));
});

test('old out-of-range edits are not rewritten until corrected', async () => {
  mockParams.log_id = 'old';
  (getFoodLogsWithFoodByDate as jest.Mock).mockResolvedValue([{ id: 'old', serving_amount: 101 }]);
  await render(<ServingPickerScreen />);
  await waitFor(() => expect(screen.getByLabelText('Amount, in servings').props.value).toBe('101'));
  expect(screen.getByText('Use 100 servings or less.')).toBeTruthy();
  expect(screen.getByLabelText('Save changes').props.accessibilityState.disabled).toBe(true);
  expect(updateFoodLog).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Amount, in servings'), '100');
  await fireEvent.press(screen.getByLabelText('Save changes'));
  await waitFor(() => expect(updateFoodLog).toHaveBeenCalledWith('old', 100, '100g', expect.any(String)));
});


test('switching units retains quantity and malformed raw text', async () => {
  await render(<ServingPickerScreen />);
  await screen.findByLabelText('Amount, in servings');
  await fireEvent.changeText(screen.getByLabelText('Amount, in servings'), '2.5');
  await fireEvent.press(screen.getByLabelText(/Serving size, 100g/));
  await fireEvent.press(screen.getByText('Grams'));
  expect(screen.getByLabelText('Amount, in grams').props.value).toBe('250');
  await fireEvent.changeText(screen.getByLabelText('Amount, in grams'), '1.2.3');
  await fireEvent.press(screen.getByLabelText(/Serving size, Grams/));
  await fireEvent.press(screen.getByText('Ounces'));
  expect(screen.getByLabelText('Amount, in ounces').props.value).toBe('1.2.3');
  expect(screen.getByLabelText('Log to Lunch').props.accessibilityState.disabled).toBe(true);
  expect(addFoodLog).not.toHaveBeenCalled();
});


test('switching units preserves an out-of-range number for correction', async () => {
  mockParams.initial_amount = '101';
  await render(<ServingPickerScreen />);
  await screen.findByLabelText('Amount, in servings');
  await fireEvent.press(screen.getByLabelText(/Serving size, 100g/));
  await fireEvent.press(screen.getByText('Grams'));
  expect(screen.getByLabelText('Amount, in grams').props.value).toBe('101');
});

test('missing route readiness disables logging', async () => {
  delete mockParams.meal_slot;
  await render(<ServingPickerScreen />);
  await screen.findByLabelText('Amount, in servings');
  expect(screen.getByLabelText('Log to Lunch').props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByLabelText('Log to Lunch'));
  expect(addFoodLog).not.toHaveBeenCalled();
});


test('failed edit load offers retry after the food loads and saves only the recovered amount', async () => {
  mockParams.log_id = 'old';
  (getFoodLogsWithFoodByDate as jest.Mock).mockRejectedValue(new Error('disk busy'));
  await render(<ServingPickerScreen />);
  await screen.findByLabelText('Amount, in servings');
  await screen.findByText("Couldn't load this entry.");
  expect(screen.getByLabelText('Save changes').props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByLabelText('Save changes'));
  expect(updateFoodLog).not.toHaveBeenCalled();
  (getFoodLogsWithFoodByDate as jest.Mock).mockResolvedValue([{ id: 'old', serving_amount: 2.5 }]);
  await fireEvent.press(screen.getByLabelText('Retry loading entry'));
  await waitFor(() => expect(screen.getByLabelText('Amount, in servings').props.value).toBe('2.5'));
  expect(screen.queryByText("Couldn't load this entry.")).toBeNull();
  expect(screen.getByLabelText('Save changes').props.accessibilityState.disabled).toBe(false);
  await fireEvent.press(screen.getByLabelText('Save changes'));
  expect(updateFoodLog).toHaveBeenCalledWith('old', 2.5, '100g', expect.any(String));
});

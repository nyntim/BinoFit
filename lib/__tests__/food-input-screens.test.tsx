import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import CustomFoodScreen from '@/app/custom-food';
import ServingPickerScreen from '@/app/serving-picker';
import { addCustomFood, updateCustomFood, getFoodById, addFoodLog, updateFoodLog, getFoodLogsWithFoodByDate } from '@/lib/database';

let mockParams: Record<string, string>;
let mockFocusCallback: () => (() => void) | undefined;
const mockFood = { id: 'food', name: 'Food', serving_units: '100g', calories: 100, protein: 10, carbs: 20, fat: 5, source: 'custom' };
const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismiss: jest.fn() };
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => mockRouter, useFocusEffect: (callback: typeof mockFocusCallback) => { mockFocusCallback = callback; require('react').useEffect(callback, [callback]); } }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => '#333333' }));
jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'light' }));
jest.mock('@/hooks/useMealDefinitions', () => ({ useMealDefinitions: () => ({ loaded: true, labelFor: () => 'Lunch' }) }));
jest.mock('@/components/time-picker-sheet', () => ({ TimePickerSheet: () => null }));
jest.mock('@/lib/database', () => ({
  addCustomFood: jest.fn(), updateCustomFood: jest.fn(), addFoodLog: jest.fn(), updateFoodLog: jest.fn(),
  getFoodById: jest.fn(async () => ({ id: 'food', name: 'Food', serving_units: '100g', calories: 100, protein: 10, carbs: 20, fat: 5, source: 'custom' })),
  getFoodLogsWithFoodByDate: jest.fn(), hasAnyMicros: () => false,
  getMealSlotConfirmationsByDate: jest.fn(async () => []), ensureMealSlotStatus: jest.fn(async () => true),
}));
jest.mock('@/lib/storage', () => ({ getUserGoals: async () => null, getDefaultLogStatus: async () => 'eaten' }));
jest.mock('@/lib/sync', () => ({ syncToSupabase: jest.fn() }));
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
  (getFoodById as jest.Mock).mockResolvedValue(mockFood);
  (updateCustomFood as jest.Mock).mockResolvedValue(mockFood);
});

async function fillCustom() {
  await fireEvent.changeText(screen.getByLabelText('Name (required)'), ' Yogurt ');
  await fireEvent.changeText(screen.getByLabelText('Serving size (required)'), ' 1 cup (240g) ');
  await fireEvent.changeText(screen.getByLabelText('Calories (required)'), '0');
}

test('custom food keeps pristine fields quiet, explains malformed macros, and saves zero blanks', async () => {
  delete mockParams.food_id;
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
  delete mockParams.food_id;
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

test('header back names where it returns', async () => {
  const first = await render(<ServingPickerScreen />);
  await screen.findByLabelText('Amount, in servings');
  expect(screen.getByText('Back')).toBeTruthy();
  expect(screen.getByLabelText('Back')).toBeTruthy();
  await first.unmount();
  mockParams.origin = 'search';
  await render(<ServingPickerScreen />);
  await screen.findByLabelText('Amount, in servings');
  expect(screen.getByText('Search')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Back to search'));
  expect(mockRouter.back).toHaveBeenCalled();
});

test('logging from search closes the picker and search; otherwise just the picker', async () => {
  mockParams.origin = 'search';
  const first = await render(<ServingPickerScreen />);
  await screen.findByLabelText('Amount, in servings');
  await fireEvent.press(screen.getByLabelText('Log to Lunch'));
  await waitFor(() => expect(mockRouter.dismiss).toHaveBeenCalledWith(2));
  expect(mockRouter.back).not.toHaveBeenCalled();
  await first.unmount();
  jest.clearAllMocks();
  delete mockParams.origin;
  await render(<ServingPickerScreen />);
  await screen.findByLabelText('Amount, in servings');
  await fireEvent.press(screen.getByLabelText('Log to Lunch'));
  await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  expect(mockRouter.dismiss).not.toHaveBeenCalled();
});

test('edit mode keeps the visible Cancel text', async () => {
  mockParams.log_id = 'old';
  (getFoodLogsWithFoodByDate as jest.Mock).mockResolvedValue([{ id: 'old', serving_amount: 2 }]);
  await render(<ServingPickerScreen />);
  expect(screen.getByText('Cancel')).toBeTruthy();
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
  await fireEvent.press(screen.getByRole('radio', { name: 'Grams' }));
  expect(screen.getByLabelText('Amount, in grams').props.value).toBe('250');
  await fireEvent.changeText(screen.getByLabelText('Amount, in grams'), '1.2.3');
  await fireEvent.press(screen.getByRole('radio', { name: 'Ounces' }));
  expect(screen.getByLabelText('Amount, in ounces').props.value).toBe('1.2.3');
  expect(screen.getByLabelText('Log to Lunch').props.accessibilityState.disabled).toBe(true);
  expect(addFoodLog).not.toHaveBeenCalled();
});


test('switching units preserves an out-of-range number for correction', async () => {
  mockParams.initial_amount = '101';
  await render(<ServingPickerScreen />);
  await screen.findByLabelText('Amount, in servings');
  await fireEvent.press(screen.getByRole('radio', { name: 'Grams' }));
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


test('optional nutrients preserve zero, tiny values and drafts, with invalid collapsed input still visible', async () => {
  delete mockParams.food_id;
  await render(<CustomFoodScreen />);
  await fillCustom();
  expect(screen.queryByLabelText('Fiber (g)')).toBeNull();
  for (const group of ['Other nutrients', 'Minerals', 'Vitamins']) await fireEvent.press(screen.getByLabelText(group));
  await fireEvent.changeText(screen.getByLabelText('Fiber (g)'), '0');
  await fireEvent.changeText(screen.getByLabelText('Vitamin B12 (µg)'), '0.00000001');
  await fireEvent.changeText(screen.getByLabelText('Iron (mg)'), '-1');
  // Collapsing a group with an invalid field keeps its error visible under the header
  await fireEvent.press(screen.getByLabelText('Minerals'));
  expect(screen.getByText('Iron: enter a finite number of 0 or more.')).toBeTruthy();
  expect(screen.getByLabelText('Save food').props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByLabelText('Minerals'));
  expect(screen.getByLabelText('Fiber (g)').props.value).toBe('0');
  expect(screen.getByLabelText('Vitamin B12 (µg)').props.value).toBe('0.00000001');
  await fireEvent.changeText(screen.getByLabelText('Iron (mg)'), '');
  await fireEvent.press(screen.getByLabelText('Minerals'));
  await fireEvent.press(screen.getByLabelText('Save food'));
  expect(addCustomFood).toHaveBeenCalledWith(expect.objectContaining({ fiber: 0, b12: 0.00000001, iron: null, sodium: null }));
});

test('custom edits prefill zero and tiny nutrients, preserve collapsed values and allow explicit clear', async () => {
  (getFoodById as jest.Mock).mockResolvedValue({ ...mockFood, fiber: 0, b12: 1e-8, iron: 2 });
  await render(<CustomFoodScreen />);
  await screen.findByLabelText('Name (required)');
  await fireEvent.changeText(screen.getByLabelText('Name (required)'), 'Updated');
  for (const group of ['Other nutrients', 'Minerals', 'Vitamins']) await fireEvent.press(screen.getByLabelText(group));
  expect(screen.getByLabelText('Fiber (g)').props.value).toBe('0');
  expect(screen.getByLabelText('Vitamin B12 (µg)').props.value).toBe('0.00000001');
  expect(screen.getByLabelText('Sodium (mg)').props.value).toBe('');
  await fireEvent.changeText(screen.getByLabelText('Iron (mg)'), '');
  await fireEvent.press(screen.getByLabelText('Minerals'));
  await fireEvent.press(screen.getByLabelText('Save food'));
  expect(updateCustomFood).toHaveBeenCalledWith('food', expect.objectContaining({ name: 'Updated', fiber: 0, b12: 1e-8, iron: null, sodium: null }));
  expect(mockRouter.back).toHaveBeenCalled();
  expect(addCustomFood).not.toHaveBeenCalled();
});

test('custom edit rejects remote definitions and offers retry', async () => {
  (getFoodById as jest.Mock).mockResolvedValue({ ...mockFood, source: 'usda' });
  await render(<CustomFoodScreen />);
  await screen.findByText('Couldn’t load this custom food.');
  expect(screen.getByLabelText('Save food').props.accessibilityState.disabled).toBe(true);
  (getFoodById as jest.Mock).mockResolvedValue(mockFood);
  await fireEvent.press(screen.getByLabelText('Retry loading food'));
  await screen.findByLabelText('Name (required)');
  expect(screen.getByLabelText('Name (required)').props.value).toBe('Food');
});

test('returning from a custom edit refreshes nutrients while keeping amount and log context', async () => {
  mockParams.log_id = 'old';
  (getFoodLogsWithFoodByDate as jest.Mock).mockResolvedValue([{ id: 'old', serving_amount: 2 }]);
  await render(<ServingPickerScreen />);
  await waitFor(() => expect(screen.getByLabelText('Amount, in servings').props.value).toBe('2'));
  await fireEvent.changeText(screen.getByLabelText('Amount, in servings'), '2.5');
  await fireEvent.press(screen.getByLabelText('Edit food'));
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/custom-food', params: { food_id: 'food', meal_slot: 'lunch', date: '2026-10-20' } });
  (getFoodById as jest.Mock).mockResolvedValue({ ...mockFood, name: 'Edited food', b12: 0.00000001, added_sugar: 0, monounsat_fat: 2 });
  let cleanupFocus: (() => void) | undefined;
  await act(async () => { cleanupFocus = mockFocusCallback(); });
  expect(screen.getByText('Edited food')).toBeTruthy();
  expect(screen.getByLabelText('Amount, in servings').props.value).toBe('2.5');
  await fireEvent.press(screen.getByLabelText('Complete Nutrient Summary'));
  expect(screen.getByText('0.000000025 µg')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Save changes'));
  expect(updateFoodLog).toHaveBeenCalledWith('old', 2.5, '100g', expect.any(String));
  cleanupFocus?.();
});


test('edit shows Log with Save changes accessibility and preserves full serving precision', async () => {
  mockParams.log_id = 'log';
  (getFoodLogsWithFoodByDate as jest.Mock).mockResolvedValue([{ id: 'log', food_id: 'food', serving_amount: 1.23456789 }]);
  await render(<ServingPickerScreen />);
  expect(await screen.findByDisplayValue('1.23456789')).toBeTruthy();
  expect(screen.getByText('Log')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Save changes'));
  await waitFor(() => expect(updateFoodLog).toHaveBeenCalledWith('log', 1.23456789, '100g', expect.any(String)));
});

test('unbranded OFF foods show a readable source in the serving picker', async () => {
  (getFoodById as jest.Mock).mockResolvedValue({ ...mockFood, source: 'open_food_facts', brand: null });
  await render(<ServingPickerScreen />);
  expect(await screen.findByText('Open Food Facts')).toBeTruthy();
  expect(screen.queryByText('open_food_facts')).toBeNull();
});

test('the amount stepper steps by half a serving and Less is disabled at the minimum', async () => {
  await render(<ServingPickerScreen />);
  const amount = await screen.findByLabelText('Amount, in servings');
  expect(amount.props.value).toBe('1');
  await fireEvent.press(screen.getByLabelText('More'));
  expect(screen.getByLabelText('Amount, in servings').props.value).toBe('1.5');
  await fireEvent.press(screen.getByLabelText('Less'));
  await fireEvent.press(screen.getByLabelText('Less'));
  expect(screen.getByLabelText('Amount, in servings').props.value).toBe('0.5');
  expect(screen.getByLabelText('Less').props.accessibilityState.disabled).toBe(true);
  await fireEvent.changeText(screen.getByLabelText('Amount, in servings'), '');
  expect(screen.getByLabelText('Less').props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByLabelText('More'));
  expect(screen.getByLabelText('Amount, in servings').props.value).toBe('0.5');
});

test('the status row is a read-only tag: the default for new food, the slot status for an edit', async () => {
  const first = await render(<ServingPickerScreen />);
  await screen.findByLabelText('Amount, in servings');
  await waitFor(() => expect(screen.getByText('Eaten')).toBeTruthy());
  expect(screen.queryByRole('radio', { name: 'Planned' })).toBeNull();
  await first.unmount();
  const { getMealSlotConfirmationsByDate } = jest.requireMock('@/lib/database');
  getMealSlotConfirmationsByDate.mockResolvedValueOnce([{ meal_slot: 'lunch', confirmed: false }]);
  mockParams.log_id = 'old';
  (getFoodLogsWithFoodByDate as jest.Mock).mockResolvedValue([{ id: 'old', serving_amount: 2 }]);
  await render(<ServingPickerScreen />);
  await waitFor(() => expect(screen.getByText('Planned')).toBeTruthy());
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import FoodBatchReviewScreen from '@/app/food-batch-review';
import type { Food } from '@/lib/types';
import { addFoodLogsBatch } from '@/lib/database';
import * as store from '@/lib/food-selection-store';

const mockBack = jest.fn();
const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ meal_slot: 'm1', date: '2026-10-20' }), useRouter: () => ({ back: mockBack, dismissTo: mockDismissTo }) }));
jest.mock('@/hooks/useMealDefinitions', () => ({ useMealDefinitions: () => ({ loaded: true, labelFor: () => 'Dinner' }) }));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => '#444444' }));
jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');
jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn(), NotificationFeedbackType: { Success: 'success' } }));
jest.mock('@/lib/database', () => ({ addFoodLogsBatch: jest.fn() }));
jest.mock('@/lib/storage', () => ({ getDefaultLogStatus: async () => 'eaten' }));
jest.mock('@/lib/sync', () => ({ syncToSupabase: jest.fn() }));
const mockResolve = jest.fn();
jest.mock('@/lib/food-resolve', () => ({ resolveLoggableFood: (f: Food) => mockResolve(f) }));

const mk = (id: string, cal: number): Food => ({ id, name: `Name ${id}`, brand: null, serving_units: '100g', calories: cal, protein: 10, carbs: 0, fat: 0, source: 'usda', updated_at: 'x' } as Food);
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
async function seed() {
  store.beginFoodSelection({ meal_slot: 'm1', date: '2026-10-20' });
  store.toggleSelectedFood(mk('a', 100)); store.toggleSelectedFood(mk('b', 50));
  await flush();
}

beforeEach(async () => {
  jest.clearAllMocks();
  (addFoodLogsBatch as jest.Mock).mockResolvedValue([]);
  mockResolve.mockImplementation(async (f: Food) => f);
  await seed();
});

test('renders items and totals; remove updates totals and the Add count', async () => {
  await render(<FoodBatchReviewScreen />);
  expect(screen.getByText('Name a')).toBeTruthy();
  expect(screen.getByText('150 cal')).toBeTruthy();
  expect(screen.getByLabelText('Add 2 foods')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Remove Name a'));
  expect(screen.getAllByText('50 cal')).toHaveLength(2);
  expect(screen.getByLabelText('Add 1 food')).toBeTruthy();
});

test('Add is disabled while an item failed and Try again re-resolves it', async () => {
  store.beginFoodSelection({ meal_slot: 'm1', date: '2026-10-20' });
  mockResolve.mockResolvedValueOnce(null);
  store.toggleSelectedFood(mk('a', 100)); await flush();
  await render(<FoodBatchReviewScreen />);
  expect(screen.getByText("Couldn't load full details.")).toBeTruthy();
  expect(screen.getByLabelText('Add 1 food').props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByText('Try again'));
  await flush();
  expect(screen.getByLabelText('Add 1 food').props.accessibilityState.disabled).toBe(false);
});

test('empty draft shows the empty state with Add disabled', async () => {
  await render(<FoodBatchReviewScreen />);
  await act(async () => { store.clearSelectedFoods(); });
  expect(screen.getByText('Back to search')).toBeTruthy();
  expect(screen.getByLabelText('Add 0 foods').props.accessibilityState.disabled).toBe(true);
});

test('a rejected save shows the banner and keeps the items; retry succeeds and leaves', async () => {
  (addFoodLogsBatch as jest.Mock).mockRejectedValueOnce(new Error('db'));
  await render(<FoodBatchReviewScreen />);
  await fireEvent.press(screen.getByLabelText('Add 2 foods'));
  await flush();
  expect(screen.getByText("Couldn't add these foods.")).toBeTruthy();
  expect(screen.getByText('Name a')).toBeTruthy();
  await fireEvent.press(screen.getByText('Try again'));
  await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith('/(tabs)'));
  expect(addFoodLogsBatch).toHaveBeenCalledTimes(2);
});

test('a double press saves once', async () => {
  await render(<FoodBatchReviewScreen />);
  const add = screen.getByLabelText('Add 2 foods');
  await fireEvent.press(add); await fireEvent.press(add);
  await waitFor(() => expect(mockDismissTo).toHaveBeenCalled());
  expect(addFoodLogsBatch).toHaveBeenCalledTimes(1);
});

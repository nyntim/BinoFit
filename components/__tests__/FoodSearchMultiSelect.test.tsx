import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import FoodSearchScreen from '@/app/food-search';
import type { Food } from '@/lib/types';
import { getRecentFoods, getFrequentFoods } from '@/lib/database';
import { searchLocal, searchBranded, sortFoodResults } from '@/lib/food-service';
import { getFoodSelection } from '@/lib/food-selection-store';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockDispatch = jest.fn();
let mockPrevent: { enabled: boolean; cb: (e: { data: { action: unknown } }) => void } | null = null;
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ meal_slot: 'dinner-id', date: '2026-10-20' }), useRouter: () => ({ replace: mockReplace, push: mockPush, back: jest.fn() }) }));
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (enabled: boolean, cb: (e: { data: { action: unknown } }) => void) => { mockPrevent = { enabled, cb }; },
  useNavigation: () => ({ dispatch: mockDispatch }),
}));
jest.mock('@/hooks/useMealDefinitions', () => ({ useMealDefinitions: () => ({ loaded: true, labelFor: () => 'Dinner' }) }));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => '#444444' }));
jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');
jest.mock('@/lib/database', () => ({ getRecentFoods: jest.fn(), getFrequentFoods: jest.fn(), getFoodById: jest.fn(), cacheRemoteFood: jest.fn(), hasAnyMicros: () => true, addFoodLogsBatch: jest.fn() }));
jest.mock('@/lib/food-resolve', () => ({ ...jest.requireActual('@/lib/food-resolve'), resolveLoggableFood: async (f: Food) => f }));
jest.mock('@/lib/food-service', () => ({
  searchLocal: jest.fn(), searchBranded: jest.fn(), sortFoodResults: jest.fn(), getFullBrandedFood: jest.fn(),
  shouldAutoFetchBranded: () => false,
  parseQuery: (query: string) => ({ term: query.replace(/^2 /, ''), tokens: query.replace(/^2 /, '').trim().split(/\s+/).filter(Boolean), quantity: query.startsWith('2 ') ? 2 : null, unit: '' }),
}));

const mk = (i: number): Food => ({ id: `food-${i}`, name: `Food ${i}`, brand: null, serving_units: '100g', calories: 100, protein: 10, carbs: 12, fat: 3, source: 'usda', updated_at: 'x' } as Food);
const foods = [mk(0), mk(1), mk(2)];
const search = async (q = 'food') => {
  await fireEvent.changeText(screen.getByPlaceholderText('Search foods…'), q);
  await act(async () => { jest.advanceTimersByTime(300); });
};
const enterSelect = () => fireEvent.press(screen.getByLabelText('Select multiple'));

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); mockPrevent = null;
  (getRecentFoods as jest.Mock).mockResolvedValue([foods[0]]); (getFrequentFoods as jest.Mock).mockResolvedValue([foods[0], foods[1]]);
  (searchLocal as jest.Mock).mockResolvedValue(foods); (searchBranded as jest.Mock).mockResolvedValue([]);
  (sortFoodResults as jest.Mock).mockImplementation(async (items) => items);
});
afterEach(() => jest.useRealTimers());

test('select mode toggles rows instead of opening the serving picker, and shared foods show checked in both sections', async () => {
  await render(<FoodSearchScreen />);
  await enterSelect();
  const rows = screen.getAllByRole('checkbox');
  expect(rows).toHaveLength(3);
  await fireEvent.press(screen.getAllByText('Food 0')[0]);
  expect(mockPush).not.toHaveBeenCalled();
  expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(2);
  expect(screen.getByText('1 selected')).toBeTruthy();
  await fireEvent.press(screen.getAllByText('Food 0')[1]);
  expect(screen.getByText('0 selected')).toBeTruthy();
});

test('outside select mode a tap still opens the serving picker', async () => {
  await render(<FoodSearchScreen />);
  await fireEvent.press(screen.getAllByText('Food 1')[0]);
  await act(async () => {});
  expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/serving-picker' }));
});

test('selection survives a query change; Review is disabled at zero and pushes the review screen', async () => {
  await render(<FoodSearchScreen />);
  await enterSelect();
  expect(screen.getByLabelText('Review selected foods').props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getAllByText('Food 1')[0]);
  await search('food');
  expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(1);
  await fireEvent.press(screen.getByText('Food 2'));
  expect(getFoodSelection().order).toEqual(['food-1', 'food-2']);
  await fireEvent.press(screen.getByLabelText('Review selected foods'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/food-batch-review', params: { meal_slot: 'dinner-id', date: '2026-10-20' } });
});

test('a parsed quantity becomes the initial amount', async () => {
  await render(<FoodSearchScreen />);
  await enterSelect();
  await search('2 food');
  await fireEvent.press(screen.getByText('Food 0'));
  expect(getFoodSelection().items['food-0'].amount).toBe('2');
});

test('leaving select mode with items prompts; with none it just exits', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<FoodSearchScreen />);
  await enterSelect();
  await enterSelect();
  expect(screen.queryByText('0 selected')).toBeNull();
  await enterSelect();
  await fireEvent.press(screen.getAllByText('Food 1')[0]);
  await enterSelect();
  expect(alert).toHaveBeenCalledWith('Discard selection?', expect.any(String), expect.any(Array));
  expect(screen.getByText('1 selected')).toBeTruthy();
  const discard = (alert.mock.calls[0][2] as { text: string; onPress?: () => void }[]).find((b) => b.text === 'Discard')!;
  await act(async () => { discard.onPress!(); });
  expect(getFoodSelection().order).toEqual([]);
});

test('leaving the screen with a selection asks first', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<FoodSearchScreen />);
  await enterSelect();
  await fireEvent.press(screen.getAllByText('Food 1')[0]);
  expect(mockPrevent!.enabled).toBe(true);
  const action = { type: 'GO_BACK' };
  mockPrevent!.cb({ data: { action } });
  expect(alert).toHaveBeenCalledWith('Discard 1 food?', 'Your selected foods have not been added.', expect.any(Array));
  expect(mockDispatch).not.toHaveBeenCalled();
  (alert.mock.calls[0][2] as { text: string; onPress?: () => void }[]).find((b) => b.text === 'Discard')!.onPress!();
  expect(mockDispatch).toHaveBeenCalledWith(action);
});

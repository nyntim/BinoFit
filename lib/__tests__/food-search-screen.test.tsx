import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import FoodSearchScreen from '@/app/food-search';
import { searchLocal, searchBranded, sortFoodResults } from '@/lib/food-service';
import { getRecentFoods, getFrequentFoods } from '@/lib/database';
import { supabase } from '@/lib/supabase';
import type { Food } from '@/lib/types';
const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };
const mockPrevent = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ meal_slot: 'lunch', date: '2026-10-23' }), useRouter: () => mockRouter }));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({ dispatch: jest.fn() }), usePreventRemove: (...args: unknown[]) => mockPrevent(...args) }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => 'black' }));
jest.mock('@/hooks/useKeyboardHeight', () => ({ useKeyboardHeight: () => 0 }));
jest.mock('@/hooks/useScrollRestore', () => ({ useScrollRestore: () => ({}) }));
jest.mock('@/hooks/useMealDefinitions', () => ({ useMealDefinitions: () => ({ loaded: true, labelFor: () => 'Lunch' }) }));
jest.mock('@/hooks/useNewFoodStatus', () => ({ useNewFoodStatus: () => 'eaten' }));
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));
jest.mock('@/hooks/useFoodSelection', () => ({ useFoodSelection: () => ({ order: [], items: {}, context: null }) }));
jest.mock('@/lib/food-selection-store', () => ({ beginFoodSelection: jest.fn(), endFoodSelection: jest.fn(), getFoodSelection: () => ({ order: [] }), clearSelectedFoods: jest.fn() }));
jest.mock('@/lib/food-resolve', () => ({ needsRemoteDetails: () => false }));
jest.mock('@/lib/database', () => ({ getRecentFoods: jest.fn(async () => []), getFrequentFoods: jest.fn(async () => []) }));
jest.mock('@/lib/food-service', () => ({
  searchLocal: jest.fn(async () => []), searchBranded: jest.fn(async () => []),
  sortFoodResults: jest.fn(async (rows: Food[]) => rows),
  parseQuery: (query: string) => ({ term: query, tokens: query.trim().split(/\s+/).filter(Boolean) }),
}));
const tick = async (ms: number) => { await act(async () => { await jest.advanceTimersByTimeAsync(ms); }); };
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); (getRecentFoods as jest.Mock).mockResolvedValue([]); (getFrequentFoods as jest.Mock).mockResolvedValue([]); (searchLocal as jest.Mock).mockResolvedValue([]); (searchBranded as jest.Mock).mockResolvedValue([]); });
afterEach(async () => { await cleanup(); jest.useRealTimers(); });

test('waits for remote search before displaying one actionable empty state', async () => {
  await render(<FoodSearchScreen />);
  await fireEvent.changeText(screen.getByLabelText('Search foods'), 'qwzxv');
  await tick(200);
  expect(screen.queryByText('No matches yet')).toBeNull();
  await tick(600);
  expect(screen.getAllByText('No matches yet')).toHaveLength(1);
  await fireEvent.press(screen.getByText('+ Create custom food'));
  expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/custom-food', params: { meal_slot: 'lunch', date: '2026-10-23' } });
  await fireEvent.press(screen.getByText('Create "qwzxv"'));
  expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/custom-food', params: { meal_slot: 'lunch', date: '2026-10-23', name: 'qwzxv' } });
  await fireEvent.press(screen.getByText('Scan a barcode'));
  expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/barcode-scanner', params: { meal_slot: 'lunch', date: '2026-10-23' } });
});

test('a failed branded lookup shows a neutral Retry bar instead of the Load button, and local results stay', async () => {
  (searchLocal as jest.Mock).mockResolvedValue([{ id: 'local-1', name: 'Local oats', brand: null, serving_units: '100 g', calories: 380, protein: 13, carbs: 66, fat: 7, source: 'usda', updated_at: '' }]);
  (searchBranded as jest.Mock).mockRejectedValue(new Error('offline'));
  await render(<FoodSearchScreen />);
  await fireEvent.changeText(screen.getByLabelText('Search foods'), 'oats');
  await tick(900);
  expect(await screen.findByText(/Local oats/)).toBeTruthy();
  expect(screen.getByText('Branded foods couldn’t load. Local results still work.')).toBeTruthy();
  expect(screen.queryByText('Load branded foods')).toBeNull();
  const before = (searchBranded as jest.Mock).mock.calls.length;
  await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  await tick(10);
  expect((searchBranded as jest.Mock).mock.calls.length).toBeGreaterThan(before);
});

test('sort changes only reorder loaded rows and keyboard submit immediately searches', async () => {
  await render(<FoodSearchScreen />);
  await fireEvent.changeText(screen.getByLabelText('Search foods'), 'brand');
  await fireEvent(screen.getByLabelText('Search foods'), 'submitEditing');
  await tick(0); expect(searchBranded).toHaveBeenCalledTimes(1);
  await tick(800);
  await fireEvent.press(screen.getByText('A → Z')); await tick(0);
  expect(sortFoodResults).toHaveBeenCalledWith(expect.any(Array), 'az');
  expect(searchBranded).toHaveBeenCalledTimes(1);
});

test('clearing and unmounting abort transport immediately and reject late results', async () => {
  let resolve!: (rows: Food[]) => void;
  (searchBranded as jest.Mock).mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = await render(<FoodSearchScreen />);
  await fireEvent.changeText(screen.getByLabelText('Search foods'), 'milk'); await tick(800);
  const options = (searchBranded as jest.Mock).mock.calls[0][2];
  await fireEvent.changeText(screen.getByLabelText('Search foods'), '');
  expect(options.signal.aborted).toBe(true);
  await act(async () => { resolve([{ id: 'late', name: 'Late milk' } as Food]); });
  expect(screen.queryByText('Late milk')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Search foods'), 'milk'); await tick(800);
  await view.unmount();
  expect((searchBranded as jest.Mock).mock.calls[1][2].signal.aborted).toBe(true);
});

test('a stale asynchronous sort cannot restore an earlier query', async () => {
  const milk = { id: 'milk', name: 'Milk', calories: 10 } as Food;
  (searchLocal as jest.Mock).mockResolvedValueOnce([milk]);
  let release!: (rows: Food[]) => void;
  (sortFoodResults as jest.Mock).mockImplementation((rows: Food[]) => rows.length ? new Promise(done => { release = done; }) : Promise.resolve(rows));
  await render(<FoodSearchScreen />);
  await fireEvent.changeText(screen.getByLabelText('Search foods'), 'milk'); await tick(200);
  await fireEvent.changeText(screen.getByLabelText('Search foods'), '');
  await act(async () => { release([milk]); });
  expect(screen.queryByText('Milk')).toBeNull();
});


test('account change clears suggestions and rejects the previous account pending reads', async () => {
  let resolve!: (rows: Food[]) => void;
  (getRecentFoods as jest.Mock).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  (getFrequentFoods as jest.Mock).mockResolvedValue([{ id: 'old', name: 'Old frequent', calories: 0 } as Food]);
  await render(<FoodSearchScreen />);
  const authChanged = (supabase.auth.onAuthStateChange as jest.Mock).mock.calls[0][0];
  await act(async () => { authChanged('INITIAL_SESSION', { user: { id: 'old-account' } }); });
  await act(async () => { authChanged('SIGNED_IN', { user: { id: 'new-account' } }); });
  await act(async () => { resolve([{ id: 'old', name: 'Old recent', calories: 0 } as Food]); });
  expect(screen.queryByText('Old recent')).toBeNull();
  expect(screen.queryByText('Old frequent')).toBeNull();
  expect(screen.getByText('Search for a food to get started')).toBeTruthy();
});

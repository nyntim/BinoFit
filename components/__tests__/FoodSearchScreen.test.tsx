import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { FlatListProps } from 'react-native';
import FoodSearchScreen from '@/app/food-search';
import type { Food } from '@/lib/types';
import { getRecentFoods, getFrequentFoods } from '@/lib/database';
import { searchLocal, searchBranded, sortFoodResults, getFullBrandedFood } from '@/lib/food-service';

let mockListProps: FlatListProps<unknown>;
let mockListInstance: import('react-native').FlatList<unknown> | null = null;
let mockKeyboardHeight = 0;
jest.mock('react-native/Libraries/Lists/FlatList', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ActualList = jest.requireActual('react-native/Libraries/Lists/FlatList').default;
  return {
    __esModule: true,
    default: React.forwardRef(function CapturedFlatList(props: import('react-native').FlatListProps<unknown>, ref: import('react').ForwardedRef<import('react-native').FlatList<unknown>>) {
      mockListProps = props;
      const setRef = (inst: import('react-native').FlatList<unknown> | null) => {
        mockListInstance = inst;
        if (typeof ref === 'function') ref(inst); else if (ref) ref.current = inst;
      };
      return React.createElement(ActualList, { ...props, ref: setRef, testID: 'food-list' });
    }),
  };
});
const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ meal_slot: 'dinner-id', date: '2026-10-20' }), useRouter: () => ({ replace: mockReplace, push: mockPush, back: jest.fn() }) }));
jest.mock('@/hooks/useKeyboardHeight', () => ({ useKeyboardHeight: () => mockKeyboardHeight }));
jest.mock('@/hooks/useMealDefinitions', () => ({ useMealDefinitions: () => ({ loaded: true, labelFor: () => 'Dinner' }) }));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => '#444444' }));
jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');
jest.mock('@/lib/database', () => ({ getRecentFoods: jest.fn(), getFrequentFoods: jest.fn() }));
jest.mock('@/lib/food-service', () => ({
  searchLocal: jest.fn(), searchBranded: jest.fn(), sortFoodResults: jest.fn(), getFullBrandedFood: jest.fn(),
  shouldAutoFetchBranded: (count: number) => count < 8,
  parseQuery: (query: string) => ({ term: query.replace(/^2 /, ''), quantity: query.startsWith('2 ') ? 2 : null, unit: '' }),
}));
const foods: Food[] = Array.from({ length: 60 }, (_, i) => ({ id: `food-${i}`, name: `Food ${String(i).padStart(2, '0')} with a long descriptive name`, brand: i % 2 ? 'Brand' : null, serving_units: '100g', calories: 100, protein: 10, carbs: 12, fat: 3, source: 'usda', updated_at: '2026-10-20' }));
const list = () => ({ props: mockListProps });
const rows = () => list().props.data as { key: string; type: string; food?: Food; status?: string }[];
const search = async (query = 'food') => {
  await fireEvent.changeText(screen.getByPlaceholderText('Search foods…'), query);
  await act(async () => { jest.advanceTimersByTime(300); });
};
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); mockKeyboardHeight = 0;
  (getRecentFoods as jest.Mock).mockResolvedValue([]); (getFrequentFoods as jest.Mock).mockResolvedValue([]);
  (searchLocal as jest.Mock).mockResolvedValue(foods); (searchBranded as jest.Mock).mockResolvedValue([]);
  (sortFoodResults as jest.Mock).mockImplementation(async (items) => items);
  (getFullBrandedFood as jest.Mock).mockResolvedValue(null);
});
afterEach(() => jest.useRealTimers());

test('real FlatList keeps all 60 rows in service order while mounting a bounded window and selecting an offscreen row', async () => {
  await render(<FoodSearchScreen />); await search('2 food');
  expect(rows().map((r) => r.food?.id)).toEqual(foods.map((f) => f.id));
  expect(screen.queryByText(foods[59].name)).toBeNull();
  expect(screen.getAllByText(/with a long descriptive name/).length).toBeLessThan(60);
  // Supply native measurements, then scroll into the final window.
  await fireEvent(screen.getByTestId('food-list'), 'layout', { nativeEvent: { layout: { width: 390, height: 600 } } });
  await fireEvent(screen.getByTestId('food-list'), 'contentSizeChange', 390, 6000);
  await fireEvent.scroll(screen.getByTestId('food-list'), { nativeEvent: { contentOffset: { y: 5500, x: 0 }, contentSize: { height: 6000, width: 390 }, layoutMeasurement: { height: 600, width: 390 } } });
  await act(async () => { jest.advanceTimersByTime(500); });
  await fireEvent.press(screen.getByText(foods[59].name));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/serving-picker', params: { food_id: 'food-59', meal_slot: 'dinner-id', date: '2026-10-20', origin: 'search', initial_amount: '2' } });
  expect(mockReplace).not.toHaveBeenCalled();
});

test('suggestions retain section order and distinct keys for shared foods; empty state and footer preserve context', async () => {
  const empty = await render(<FoodSearchScreen />);
  expect(screen.getByText('Search for a food to get started')).toBeTruthy();
  await fireEvent.press(screen.getByText('+ Create custom food'));
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/custom-food', params: { meal_slot: 'dinner-id', date: '2026-10-20' } });
  await empty.unmount();
  (getRecentFoods as jest.Mock).mockResolvedValue([foods[0]]); (getFrequentFoods as jest.Mock).mockResolvedValue([foods[0], foods[1]]);
  await render(<FoodSearchScreen />);
  expect(rows().map((r) => r.key)).toEqual(['recent:heading', 'recent:food-0', 'frequent:heading', 'frequent:food-0', 'frequent:food-1']);
  expect(list().props.ListHeaderComponent).toBeUndefined();
});

test.each([['Best Match', 'best'], ['Frequent', 'frequent'], ['Recent', 'recent'], ['A → Z', 'az'], ['Z → A', 'za']])('local sequence and id keys follow %s sorting without sorting branded rows', async (label, option) => {
  const ordered = [...foods].reverse();
  (sortFoodResults as jest.Mock).mockImplementation(async (items, sort) => sort === option ? ordered : items);
  await render(<FoodSearchScreen />); await search();
  await fireEvent.press(screen.getByText(label));
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(rows().map((r) => r.key)).toEqual(ordered.map((f) => `local:${f.id}`));
  expect(screen.getByText('Load branded foods')).toBeTruthy();
  (searchBranded as jest.Mock).mockResolvedValue([foods[2], foods[1]]);
  await fireEvent.press(screen.getByText('Load branded foods'));
  expect(searchBranded).toHaveBeenCalledWith('food', ordered.map((f) => f.id));
  expect(rows().slice(-2).map((r) => r.key)).toEqual(['branded:food-2', 'branded:food-1']);
  expect(screen.queryByText('Load branded foods')).toBeNull();
});

test('local loading, local empty and branded loading/empty remain separate status rows', async () => {
  let resolveLocal!: (value: Food[]) => void, resolveBranded!: (value: Food[]) => void;
  (searchLocal as jest.Mock).mockReturnValue(new Promise((resolve) => { resolveLocal = resolve; }));
  (searchBranded as jest.Mock).mockReturnValue(new Promise((resolve) => { resolveBranded = resolve; }));
  await render(<FoodSearchScreen />); await search();
  expect(rows()).toEqual([]);
  await act(async () => resolveLocal([]));
  expect(rows().map((r) => r.key)).toEqual(['local:empty', 'branded:divider', 'branded:heading', 'branded:loading']);
  expect(screen.getByText('Try different words or check the spelling')).toBeTruthy();
  expect(searchBranded).toHaveBeenCalledWith('food', []);
  await act(async () => resolveBranded([]));
  expect(screen.getByText('No branded results found')).toBeTruthy();
});

test('local empty message remains with branded results; hydration disables rows and preserves parsed quantity', async () => {
  const branded = { ...foods[0], source: 'branded' };
  (searchLocal as jest.Mock).mockResolvedValue([]); (searchBranded as jest.Mock).mockResolvedValue([branded]);
  let resolve!: () => void;
  (getFullBrandedFood as jest.Mock).mockReturnValue(new Promise<void>((r) => { resolve = r; }));
  await render(<FoodSearchScreen />); await search('2 food');
  expect(screen.getByText('No results for "2 food"')).toBeTruthy();
  const cell = mockListProps.renderItem!({ item: rows().find((r) => r.type === 'food')!, index: 3, separators: { highlight: jest.fn(), unhighlight: jest.fn(), updateProps: jest.fn() } }) as import('react').ReactElement<{ onPress: () => Promise<void> }>;
  await act(async () => { void cell.props.onPress(); });
  expect(getFullBrandedFood).toHaveBeenCalledWith(branded.id);
  expect(screen.getByText(branded.name)).toBeDisabled(); expect(mockPush).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText(branded.name));
  expect(getFullBrandedFood).toHaveBeenCalledTimes(1);
  await act(async () => resolve());
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/serving-picker', params: { food_id: branded.id, meal_slot: 'dinner-id', date: '2026-10-20', origin: 'search', initial_amount: '2' } });
});

test('rows show calories as their own number, a source tag, two-line names and a full accessibility label', async () => {
  const items = [
    { ...foods[1], id: 'a', name: 'Chicken breast', brand: 'Acme', calories: 249.6, source: 'usda_sr_legacy' },
    { ...foods[0], id: 'b', name: 'Mystery', brand: null, calories: 10, source: null },
  ];
  (searchLocal as jest.Mock).mockResolvedValue(items);
  await render(<FoodSearchScreen />); await search();
  expect(screen.getByText('250')).toBeTruthy();
  expect(screen.getAllByText('USDA')).toHaveLength(1);
  expect(screen.getByText('Chicken breast').props.numberOfLines).toBe(2);
  expect(screen.getByLabelText('Chicken breast, Acme, 250 calories, 100g, protein 10 grams, carbs 12 grams, fat 3 grams, source USDA')).toBeTruthy();
  expect(screen.getByLabelText('Mystery, 10 calories, 100g, protein 10 grams, carbs 12 grams, fat 3 grams')).toBeTruthy();
});

test('branded and custom foods are tagged', async () => {
  (searchLocal as jest.Mock).mockResolvedValue([{ ...foods[0], id: 'c', name: 'Mine', source: 'custom' }]);
  (searchBranded as jest.Mock).mockResolvedValue([{ ...foods[1], id: 'd', name: 'Boxed', source: 'branded' }]);
  await render(<FoodSearchScreen />); await search();
  expect(screen.getByText('Custom')).toBeTruthy();
  expect(screen.getByText('Branded')).toBeTruthy();
});

describe('scroll position', () => {
  const scrollTo = () => jest.spyOn(mockListInstance!, 'scrollToOffset');
  const scrollDown = () => fireEvent.scroll(screen.getByTestId('food-list'), { nativeEvent: { contentOffset: { y: 3000, x: 0 }, contentSize: { height: 6000, width: 390 }, layoutMeasurement: { height: 600, width: 390 } } });

  test('changing the query or sort returns the results to the top, but loading branded does not', async () => {
    await render(<FoodSearchScreen />); await search();
    await scrollDown();
    const spy = scrollTo();
    await fireEvent.changeText(screen.getByPlaceholderText('Search foods…'), 'foods');
    expect(spy).toHaveBeenCalledWith({ offset: 0, animated: false });
    spy.mockClear();
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(spy).toHaveBeenCalledWith({ offset: 0, animated: false });
    spy.mockClear();
    await fireEvent.press(screen.getByText('A → Z'));
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(spy).toHaveBeenCalledWith({ offset: 0, animated: false });
    spy.mockClear();
    await fireEvent.press(screen.getByText('Load branded foods'));
    expect(spy).not.toHaveBeenCalled();
  });

  test('a remounted results list does not restore an old offset', async () => {
    const first = await render(<FoodSearchScreen />); await search();
    await scrollDown();
    await first.unmount();
    await render(<FoodSearchScreen />); await search();
    await fireEvent(screen.getByTestId('food-list'), 'layout', { nativeEvent: { layout: { width: 390, height: 600 } } });
    await fireEvent(screen.getByTestId('food-list'), 'contentSizeChange', 390, 6000);
    const spy = scrollTo();
    await act(async () => { jest.advanceTimersByTime(500); });
    expect(spy.mock.calls.every(([arg]) => (arg as { offset: number }).offset === 0)).toBe(true);
  });
});

test('both lists adjust for the keyboard and pad their content by its height', async () => {
  mockKeyboardHeight = 300;
  await render(<FoodSearchScreen />);
  expect(mockListProps.automaticallyAdjustKeyboardInsets).toBe(true);
  expect(mockListProps.contentContainerStyle).toEqual({ paddingBottom: 340 });
  await search();
  expect(mockListProps.automaticallyAdjustKeyboardInsets).toBe(true);
  expect(mockListProps.contentContainerStyle).toEqual({ paddingBottom: 340 });
});

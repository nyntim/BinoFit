import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import HomeScreen from '@/app/(tabs)/index';
import { getFoodLogsWithFoodByDate, getMealSlotConfirmationsByDate, getWaterLogsByDate } from '@/lib/database';
import { NO_TARGETS } from '@/lib/meals';
import type { FoodLogWithFood, MealDefinition, MealNameEntry } from '@/lib/types';
import type { useMealLogs } from '@/hooks/useMealLogs';

let mockDate = '2026-01-01';
let mockFocused = true;
let mockMealState: ReturnType<typeof useMealLogs>;
let mockDefs: MealDefinition[];
let mockNames: MealNameEntry[];
const mockRouter = { push: jest.fn(), setParams: jest.fn(), navigate: jest.fn() };
const mockReload = jest.fn();
const mockStart = jest.fn();
const mockCancel = jest.fn();
const mockActivity = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
  useFocusEffect: (fn: () => void | (() => void)) => {
    jest.requireActual<typeof import('react')>('react').useEffect(() => mockFocused ? fn() : undefined, [fn, mockFocused]);
  },
}));
jest.mock('@/context/DateContext', () => ({ useDate: () => ({ selectedDate: mockDate }) }));
jest.mock('@/context/TabBarInsetContext', () => ({ useTabBarInset: () => 0, useTabBarInsetMode: () => 'measured' }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
});
jest.mock('react-native-gesture-handler', () => ({ GestureDetector: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, default: { View: jest.requireActual<typeof import('react-native')>('react-native').View } }));
jest.mock('@expo/vector-icons/MaterialIcons', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));
jest.mock('@/hooks/useSwipeDayNavigation', () => ({ useSwipeDayNavigation: () => ({ panGesture: {}, animatedStyle: {} }) }));
jest.mock('@/hooks/useScrollRestore', () => ({ useScrollRestore: () => ({}) }));
jest.mock('@/hooks/useDashboardTraining', () => ({ useDashboardTraining: () => ({ today: '2026-02-01', trainedDates: [], workouts: [] }) }));
jest.mock('@/hooks/use-health-kit', () => ({ useHealthKit: () => ({ readGranted: false, available: false, fetchTodayActivity: mockActivity }) }));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: (_: unknown, name: string) => name }));
jest.mock('@/hooks/useMealDefinitions', () => ({ useMealDefinitions: () => ({ defs: mockDefs, names: mockNames, loaded: true, reload: mockReload }) }));
jest.mock('@/hooks/useMealLogs', () => ({ useMealLogs: (date: string) => {
  const actual = jest.requireActual<typeof import('@/hooks/useMealLogs')>('@/hooks/useMealLogs');
  mockMealState = actual.useMealLogs(date);
  return mockMealState;
} }));
jest.mock('@/hooks/useMealDraft', () => ({ useMealDraft: () => ({ start: mockStart, cancel: mockCancel, dirty: false, draft: null }) }));
jest.mock('@/lib/database', () => ({ getFoodLogsWithFoodByDate: jest.fn(), getMealSlotConfirmationsByDate: jest.fn(), getWaterLogsByDate: jest.fn(), upsertMealSlotConfirmation: jest.fn() }));
jest.mock('@/lib/storage', () => ({ getUserGoals: jest.fn(async () => null), getQuickAddDrinks: jest.fn(async () => []) }));
jest.mock('@/lib/reminders', () => ({ restoreMealReminders: jest.fn() }));
jest.mock('@/lib/sync', () => ({ syncToSupabase: jest.fn() }));
jest.mock('@/components/CalendarWidget', () => ({ CalendarWidget: () => null }));
jest.mock('@/components/dashboard/DayWorkouts', () => ({ DayWorkouts: () => null }));
jest.mock('@/components/StreakBadge', () => ({ StreakBadge: () => null }));
jest.mock('@/components/SyncIndicator', () => ({ SyncIndicator: () => null }));
jest.mock('@/components/calorie-ring', () => ({ CalorieRing: () => null }));
jest.mock('@/components/settings/TabSettingsSheet', () => ({ NutritionSettingsSheet: () => null }));
jest.mock('@/components/time-picker-sheet', () => ({ TimePickerSheet: () => null }));

const foodRead = getFoodLogsWithFoodByDate as jest.Mock;
const log = (name = 'Food A', over: Partial<FoodLogWithFood> = {}): FoodLogWithFood => ({
  id: 'a', food_id: 'food', meal_slot: 'lunch', date: mockDate, serving_amount: 1, serving_unit: 'cup',
  food_name: name, food_brand: null, food_calories: 100, food_protein: 10, food_carbs: 20, food_fat: 5,
  food_serving_units: 'cup', created_at: '', updated_at: '', ...over,
});
const deferred = () => {
  let resolve!: (logs: FoodLogWithFood[]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<FoodLogWithFood[]>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const open = async (name = 'Lunch') => {
  await fireEvent.press(await screen.findByLabelText(`Nutrition summary for ${name}`));
  expect(screen.getByLabelText('Close nutrition summary')).toBeTruthy();
};

beforeEach(() => {
  mockDate = '2026-01-01'; mockFocused = true;
  mockDefs = [{ ...NO_TARGETS, id: 'lunch', position: 0, reminder_time: null, created_at: '', updated_at: '' }];
  mockNames = [{ meal_id: 'lunch', name: 'Lunch', effective_from: '2025-01-01', updated_at: '' }, { meal_id: 'lunch', name: 'Dinner', effective_from: '2026-02-01', updated_at: '' }];
  foodRead.mockReset().mockResolvedValue([log()]);
  (getMealSlotConfirmationsByDate as jest.Mock).mockResolvedValue([]);
  (getWaterLogsByDate as jest.Mock).mockResolvedValue([]);
});

test('date gates the open modal immediately and late A cannot replace B', async () => {
  const old = deferred(); const next = deferred();
  foodRead.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  const { rerender } = await render(<HomeScreen />);
  mockDate = '2026-01-02';
  await rerender(<HomeScreen />);
  await act(async () => next.resolve([log('Food B')]));
  await open();
  expect(screen.getAllByText('Food B').length).toBeGreaterThan(0);
  await act(async () => old.resolve([log('Stale A')]));
  expect(screen.queryByText('Stale A')).toBeNull();
  mockDate = '2026-01-03';
  await rerender(<HomeScreen />);
  expect(screen.queryByLabelText('Close nutrition summary')).toBeNull();
});

test('old requests cannot clear newer loading; failed B never enables stale A summary', async () => {
  const old = deferred(); const next = deferred();
  foodRead.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  const { rerender } = await render(<HomeScreen />);
  mockDate = '2026-01-02';
  await rerender(<HomeScreen />);
  await act(async () => old.resolve([log('Old')]));
  expect(screen.queryByLabelText('Nutrition summary for Lunch')).toBeNull();
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  await act(async () => next.reject(new Error('read failed')));
  expect(screen.queryByLabelText('Nutrition summary for Lunch')).toBeNull();
  error.mockRestore();
});

test('a failed date change after loaded A cannot expose its food or enable a summary for B', async () => {
  const { rerender } = await render(<HomeScreen />);
  await open();
  const next = deferred(); foodRead.mockReturnValue(next.promise);
  mockDate = '2026-01-02';
  await rerender(<HomeScreen />);
  expect(screen.queryByLabelText('Close nutrition summary')).toBeNull();
  expect(screen.queryByLabelText('Nutrition summary for Lunch')).toBeNull();
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  await act(async () => next.reject(new Error('B failed')));
  expect(screen.queryByText('Food A')).toBeNull();
  expect(screen.queryByLabelText('Nutrition summary for Lunch')).toBeNull();
  error.mockRestore();
});

test('open modal derives live servings, confirmations, names, targets and deletion', async () => {
  const { rerender } = await render(<HomeScreen />);
  await open();
  await act(async () => mockMealState.setLogs([log('Updated', { serving_amount: .5 })]));
  expect(screen.getAllByText('50 cal')).toHaveLength(2);
  expect(screen.getByText('5g')).toBeTruthy();
  expect(screen.queryByText('Food contributions')).toBeNull();
  await act(async () => mockMealState.setConfirmations([{ id: 'c', date: mockDate, meal_slot: 'lunch', confirmed: false, updated_at: '' }]));
  expect(screen.getByText('Planned · Not included in consumed totals')).toBeTruthy();
  mockNames = [{ meal_id: 'lunch', name: 'Brunch', effective_from: '2025-01-01', updated_at: '' }];
  mockDefs = [{ ...mockDefs[0], calorie_target: 25 }];
  await rerender(<HomeScreen />);
  expect(screen.getAllByText('50 / 25 cal')).toHaveLength(2);
  expect(screen.getByText('200% of target')).toBeTruthy();
  expect(screen.getAllByText('Brunch').length).toBeGreaterThan(0);
  await act(async () => mockMealState.setLogs([]));
  expect(screen.getAllByText('0 / 25 cal')).toHaveLength(2);
  expect(screen.getByText('No macro split yet')).toBeTruthy();
  mockDefs = [];
  await rerender(<HomeScreen />);
  expect(screen.queryByLabelText('Close nutrition summary')).toBeNull();
});

test('orphan meals open with no targets and close when last orphan log disappears', async () => {
  foodRead.mockResolvedValue([log('Orphan', { meal_slot: 'deleted' })]);
  await render(<HomeScreen />);
  await open('Other');
  expect(screen.getAllByText('100 cal')).toHaveLength(2);
  expect(screen.getByText('10g')).toBeTruthy();
  expect(screen.queryByText('Targets use current meal settings.')).toBeNull();
  await act(async () => mockMealState.setLogs([]));
  expect(screen.queryByLabelText('Close nutrition summary')).toBeNull();
});

test('blur closes summary, invalidates reads, and focus reload reflects saved servings', async () => {
  const { rerender } = await render(<HomeScreen />);
  await open();
  mockFocused = false;
  await rerender(<HomeScreen />);
  expect(screen.queryByLabelText('Close nutrition summary')).toBeNull();
  foodRead.mockResolvedValue([log('Persisted', { serving_amount: 2 })]);
  mockFocused = true;
  await rerender(<HomeScreen />);
  await waitFor(() => expect(screen.getByText('Persisted')).toBeTruthy());
  await open();
  expect(screen.getAllByText('200 cal')).toHaveLength(2);
  expect(screen.getByText('20g')).toBeTruthy();
});

test('edit and settings entry dismiss the summary', async () => {
  const { rerender } = await render(<HomeScreen />);
  await open();
  await fireEvent.press(screen.getByLabelText('Nutrition settings', { includeHiddenElements: true }));
  expect(screen.queryByLabelText('Close nutrition summary')).toBeNull();
  // A fresh screen exercises edit entry independently of settings.
  await rerender(<HomeScreen key="fresh" />);
  await open();
  await fireEvent.press(screen.getByLabelText('Edit meals', { includeHiddenElements: true }));
  expect(screen.queryByLabelText('Close nutrition summary')).toBeNull();
});

test('unmount prevents a pending request from committing after cleanup', async () => {
  const request = deferred(); foodRead.mockReturnValue(request.promise);
  const { unmount } = await render(<HomeScreen />);
  const setter = jest.spyOn(console, 'error').mockImplementation(() => {});
  await unmount();
  await act(async () => request.resolve([log()]));
  expect(setter).not.toHaveBeenCalled();
  setter.mockRestore();
});


test('closing restores focus to the existing accessible meal header', async () => {
  const native = jest.requireActual<typeof import('react-native')>('react-native');
  const handle = jest.spyOn(native, 'findNodeHandle').mockReturnValue(731);
  const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => {});
  try {
    await render(<HomeScreen />);
    await open();
    expect(handle).toHaveBeenCalledWith(expect.anything());
    await fireEvent.press(screen.getByRole('button', { name: 'Close nutrition summary' }));
    await waitFor(() => expect(focus).toHaveBeenCalledWith(731));
    expect(screen.getByRole('button', { name: 'Nutrition summary for Lunch' })).toBeTruthy();
  } finally {
    handle.mockRestore();
    focus.mockRestore();
  }
});

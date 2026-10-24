import { fireEvent, render, screen } from '@testing-library/react-native';
import DayDetailScreen from '@/app/day-detail';
import { getFoodLogsWithFoodByDate } from '@/lib/database';

let mockDate = '2026-10-20';
const mockSetParams = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ date: mockDate }),
  useRouter: () => ({ back: mockBack, setParams: mockSetParams, push: jest.fn() }),
  useFocusEffect: (callback: () => void) => { require('react').useEffect(callback, [callback]); },
}));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => 'gray' }));
jest.mock('@/hooks/useMealDefinitions', () => ({ useMealDefinitions: () => ({ defs: [], names: [], loaded: true }) }));
let mockWorkouts: unknown[] = [];
jest.mock('@/hooks/useDaySummary', () => ({ useDaySummary: () => ({ eatenCalories: null, workouts: mockWorkouts, loading: false }) }));
jest.mock('@/lib/storage', () => ({ getUserGoals: async () => null }));
jest.mock('@/lib/database', () => ({ getFoodLogsWithFoodByDate: jest.fn(), getMealSlotConfirmationsByDate: async () => [] }));

const log = { id: 'log', food_id: 'food', meal_slot: 'lunch', date: '2026-10-20', serving_amount: 1.234567, food_serving_units: 'cup', food_name: 'Food', food_calories: 1000, food_protein: 10, food_carbs: 20, food_fat: 5 };

beforeEach(() => {
  jest.clearAllMocks();
  mockDate = '2026-10-20';
  mockWorkouts = [];
  (getFoodLogsWithFoodByDate as jest.Mock).mockResolvedValue([log]);
});

test('day detail trims serving captions and keeps unrounded calories and source data', async () => {
  await render(<DayDetailScreen />);
  expect(await screen.findByText('1.23 × cup')).toBeTruthy();
  expect(screen.getByText('1235')).toBeTruthy();
  expect(log.serving_amount).toBe(1.234567);
});

test('summary shows the title, eaten calories against the goal and a labelled bar', async () => {
  await render(<DayDetailScreen />);
  expect(await screen.findByText('Tue 20 Oct')).toBeTruthy();
  expect(screen.getByText('Day summary')).toBeTruthy();
  expect(screen.getByLabelText('1,235 of 2,000 calories eaten')).toBeTruthy();
});

test('previous and next day change the date param, across a month boundary', async () => {
  mockDate = '2025-03-01';
  await render(<DayDetailScreen />);
  await screen.findByText('Sat 1 Mar');
  await fireEvent.press(screen.getByLabelText('Previous day'));
  expect(mockSetParams).toHaveBeenCalledWith({ date: '2025-02-28' });
  await fireEvent.press(screen.getByLabelText('Next day'));
  expect(mockSetParams).toHaveBeenCalledWith({ date: '2025-03-02' });
});

test('next day is disabled on today and after', async () => {
  const today = new Date();
  mockDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await render(<DayDetailScreen />);
  await screen.findByLabelText('Next day');
  expect(screen.getByLabelText('Next day').props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByLabelText('Next day'));
  expect(mockSetParams).not.toHaveBeenCalled();
});

test('the back button is named for Progress', async () => {
  await render(<DayDetailScreen />);
  await fireEvent.press(await screen.findByLabelText('Progress'));
  expect(mockBack).toHaveBeenCalled();
});

test('workouts show under the meals, also when no food was logged', async () => {
  (getFoodLogsWithFoodByDate as jest.Mock).mockResolvedValue([]);
  mockWorkouts = [{ id: 'w1', date: '2026-10-20', title: 'Push day', subtitle: '', durationLabel: '58 min', detailLabel: null, playlistLabel: null }];
  await render(<DayDetailScreen />);
  expect(await screen.findByText('No food logged this day')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Push day. 58 min' })).toBeTruthy();
});

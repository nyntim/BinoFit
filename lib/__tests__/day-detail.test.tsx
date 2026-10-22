import { render, screen } from '@testing-library/react-native';
import DayDetailScreen from '@/app/day-detail';
import { getFoodLogsWithFoodByDate } from '@/lib/database';

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ date: '2026-10-20' }), useRouter: () => ({ back: jest.fn() }), useFocusEffect: (callback: () => void) => { require('react').useEffect(callback, [callback]); } }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => 'gray' }));
jest.mock('@/hooks/useMealDefinitions', () => ({ useMealDefinitions: () => ({ defs: [], names: [], loaded: true }) }));
jest.mock('@/components/calorie-ring', () => ({ CalorieRing: () => null }));
jest.mock('@/components/macro-bar', () => ({ MacroBar: () => null }));
jest.mock('@/lib/storage', () => ({ getUserGoals: async () => null }));
jest.mock('@/lib/database', () => ({ getFoodLogsWithFoodByDate: jest.fn(), getMealSlotConfirmationsByDate: async () => [] }));

test('day detail trims serving captions and keeps unrounded calories and source data', async () => {
  const log = { id: 'log', food_id: 'food', meal_slot: 'lunch', date: '2026-10-20', serving_amount: 1.234567, food_serving_units: 'cup', food_name: 'Food', food_calories: 1000, food_protein: 10, food_carbs: 20, food_fat: 5 };
  (getFoodLogsWithFoodByDate as jest.Mock).mockResolvedValue([log]);
  await render(<DayDetailScreen />);
  expect(await screen.findByText('1.23 × cup')).toBeTruthy();
  expect(screen.getByText('1235')).toBeTruthy();
  expect(log.serving_amount).toBe(1.234567);
});

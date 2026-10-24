import { fireEvent, render, screen } from '@testing-library/react-native';
import { MealNutritionSummary } from '@/components/dashboard/MealNutritionSummary';
import { MacroBar } from '@/components/macro-bar';
import { normalizeNutrients } from '@/lib/nutrients';
import { NO_TARGETS, type DayMeal } from '@/lib/meals';
import type { FoodLogWithFood } from '@/lib/types';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) }));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: (_: unknown, name: string) => name }));
const meal: DayMeal = { id: 'lunch', name: 'Lunch', orphan: false, def: { ...NO_TARGETS, id: 'lunch', position: 0, reminder_time: null, created_at: '', updated_at: '' } };
const log = (over: Partial<FoodLogWithFood> = {}): FoodLogWithFood => ({
  id: 'a', food_id: 'f', date: '2026-01-01', meal_slot: 'lunch', serving_amount: .5, serving_unit: '50 g',
  food_name: 'Beans', food_brand: 'Brand', food_serving_units: '100 g', created_at: '', updated_at: '',
  food_calories: 123, food_protein: 7.77, food_carbs: 20, food_fat: 2,
  food_nutrients: normalizeNutrients({ fiber: 2, sugar: 0, iron: .25, vitamin_c: .75 }), ...over,
});
const props = { meal, logs: [log()], date: '2026-01-01', today: '2026-02-01', eaten: true, onClose: jest.fn() };

test('catalog nutrients distinguish partial, unknown and zero, with one serving multiplier', async () => {
  await render(<MealNutritionSummary {...props} logs={[log(), log({ id: 'b' }), log({ id: 'c', food_nutrients: undefined })]} />);
  expect(screen.getByText('2 g')).toBeTruthy();
  expect(screen.getByText('0 g')).toBeTruthy();
  expect(screen.getByText('0.25 mg')).toBeTruthy();
  expect(screen.getByText('0.75 mg')).toBeTruthy();
  expect(screen.getAllByText('Partial')).toHaveLength(4);
  expect(screen.getByText('2 of 8 known')).toBeTruthy();
  expect(screen.getByText('1 of 10 known')).toBeTruthy();
  expect(screen.getAllByText('Data for 2 of 3 items')).toHaveLength(4);
  expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
  expect(screen.getByText('Other nutrients')).toBeTruthy();
  expect(screen.getByText('Minerals')).toBeTruthy();
  expect(screen.getByText('Vitamins')).toBeTruthy();
  expect(screen.getByText('185')).toBeTruthy();
  expect(screen.getByText('11.7 g')).toBeTruthy();
  expect(screen.queryByText(/of \d+$/)).toBeNull();
  expect(screen.queryByText('Food contributions')).toBeNull();
  expect(screen.queryByText('Beans')).toBeNull();
  expect(screen.queryByText('0.5 × 100 g')).toBeNull();
  expect(screen.queryByText(/cal · Protein/)).toBeNull();
  expect(screen.getAllByRole('button')).toHaveLength(1);
});

test('live props update status, name, servings, targets and deletion to empty state', async () => {
  const { rerender } = await render(<MealNutritionSummary {...props} eaten={false} />);
  expect(screen.getByText('Planned')).toBeTruthy();
  expect(screen.getByText('Not included in consumed totals')).toBeTruthy();
  await rerender(<MealNutritionSummary {...props} meal={{ ...meal, name: 'Brunch', def: { ...meal.def!, calorie_target: 100, protein_target: 0, carb_target: 5 } }} logs={[log({ serving_amount: 1.5 })]} />);
  expect(screen.getByText('Brunch')).toBeTruthy();
  expect(screen.getByText('Eaten')).toBeTruthy();
  expect(screen.queryByText('Planned')).toBeNull();
  expect(screen.getByTestId('calorie-ring')).toBeTruthy();
  expect(screen.getByLabelText('185 of 100 calories for this meal')).toBeTruthy();
  expect(screen.getByText('Over by 85')).toBeTruthy();
  expect(screen.queryByText(/% of target/)).toBeNull();
  expect(screen.getByLabelText('Carbs, 30 grams of 5 grams, 600% of target')).toBeTruthy();
  expect(screen.getByText('Target: 0 g')).toBeTruthy();
  expect(screen.getByText('Targets use current meal settings.')).toBeTruthy();
  await rerender(<MealNutritionSummary {...props} logs={[]} />);
  expect(screen.getByText('0')).toBeTruthy();
  expect(screen.getByText('cal')).toBeTruthy();
  expect(screen.queryByText('Food contributions')).toBeNull();
  expect(screen.getByText('No macro split yet')).toBeTruthy();
  expect(screen.getByText('No nutrient data available for this meal.')).toBeTruthy();
});

test('unknown nutrient data has a single empty state; current/future dates omit historical target caption', async () => {
  const { rerender } = await render(<MealNutritionSummary {...props} logs={[log({ food_nutrients: undefined })]} meal={{ ...meal, name: 'Other', def: null, orphan: true }} />);
  expect(screen.getByText('Other')).toBeTruthy();
  expect(screen.getByText('No nutrient data available for this meal.')).toBeTruthy();
  expect(screen.queryByText('Unknown')).toBeNull();
  expect(screen.queryByText('Targets use current meal settings.')).toBeNull();
  await rerender(<MealNutritionSummary {...props} date={props.today} meal={{ ...meal, def: { ...meal.def!, calorie_target: 0 } }} />);
  expect(screen.getByText('62')).toBeTruthy();
  expect(screen.getByText('/ 0 cal')).toBeTruthy();
  expect(screen.queryByTestId('calorie-ring')).toBeNull();
  expect(screen.queryByText(/% of target/)).toBeNull();
  expect(screen.queryByText('Targets use current meal settings.')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Close nutrition summary' }));
  expect(props.onClose).toHaveBeenCalled();
});

test('MacroBar keeps default whole grams and supports fractional goals with precise summary grams', async () => {
  const base = { label: 'Protein', consumed: .75, color: 'red', textColor: 'black', subTextColor: 'gray' };
  const { rerender } = await render(<MacroBar {...base} />);
  expect(screen.getByText('1g')).toBeTruthy();
  await rerender(<MacroBar {...base} decimalPlaces={1} goal={.5} />);
  expect(screen.getByText('0.8g / 0.5g')).toBeTruthy();
  // A fractional target is filled to its width when actual exceeds it.
  const widths: string[] = [];
  const collect = (node: ReturnType<typeof screen.toJSON> | string): void => {
    if (!node || typeof node === 'string') return;
    if (Array.isArray(node)) { node.forEach(collect); return; }
    const style = jest.requireActual<typeof import('react-native')>('react-native').StyleSheet.flatten(node.props.style);
    if (style?.width) widths.push(style.width);
    node.children?.forEach(collect);
  };
  collect(screen.toJSON());
  expect(widths).toContain('100%');
  await rerender(<MacroBar {...base} decimalPlaces={1} goal={0} />);
  expect(screen.getByText('0.8g')).toBeTruthy();
  expect(screen.queryByText(/\//)).toBeNull();
});

test('ring, left caption, composition bar and tile labels follow targets and data', async () => {
  const withTarget = { ...meal, def: { ...meal.def!, calorie_target: 400, protein_target: 40 } };
  const three = [log(), log({ id: 'b' }), log({ id: 'c' })];
  const { rerender } = await render(<MealNutritionSummary {...props} logs={three} meal={withTarget} />);
  expect(screen.getByTestId('calorie-ring')).toBeTruthy();
  expect(screen.getByText('216 left')).toBeTruthy();
  expect(screen.getByLabelText('Protein, 11.7 grams of 40 grams, 29% of target')).toBeTruthy();
  expect(screen.getByText('of 40 g')).toBeTruthy();
  for (const label of ['Protein', 'Carbs', 'Fat']) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  expect(screen.getByText(/ 62%$/, { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByLabelText(/^Energy from protein \d+ percent, carbs 62 percent/)).toBeTruthy();
  expect(screen.queryByText('No macro split yet')).toBeNull();
  await rerender(<MealNutritionSummary {...props} logs={three} meal={{ ...meal, def: { ...meal.def!, calorie_target: null } }} />);
  expect(screen.queryByTestId('calorie-ring')).toBeNull();
  expect(screen.queryByText(/left|Over by/)).toBeNull();
  expect(screen.getByText('cal')).toBeTruthy();
});

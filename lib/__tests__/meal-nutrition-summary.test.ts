import { macroCalories } from '@/lib/meal-nutrition-summary';
import { calorieDelta, nutrientGroupCoverage, formatNutritionAmount, macroEnergyShares, mealNutritionTotals, targetPercentage } from '@/lib/meal-nutrition-summary';
import { NUTRIENTS } from '@/lib/nutrients';
import { logTotals, sumEatenTotals } from '@/lib/nutrition-totals';
import type { FoodLogWithFood } from '@/lib/types';

const log = (id: string, serving_amount: number, meal_slot = 'lunch'): FoodLogWithFood => ({
  id, serving_amount, meal_slot, food_id: 'same', date: '2026-01-01', serving_unit: '50 g',
  created_at: '', updated_at: '', food_name: 'Food', food_brand: null, food_serving_units: '100 g',
  food_calories: 123, food_protein: 7.77, food_carbs: 11.11, food_fat: 3.33,
});

test('fractional duplicate foods sum by log before rounding and include planned food', () => {
  const logs = [log('a', .35), log('b', 1.25), log('c', 5, 'dinner')];
  const total = mealNutritionTotals(logs, 'lunch');
  expect(total.calories).toBeCloseTo(196.8);
  expect(total.protein).toBeCloseTo(12.432);
  for (const key of ['calories', 'protein', 'carbs', 'fat'] as const) {
    expect(total[key]).toBeCloseTo(logTotals(logs[0])[key] + logTotals(logs[1])[key]);
  }
  expect(sumEatenTotals(logs, [{ meal_slot: 'lunch', confirmed: false }]).calories).toBe(615);
  expect(sumEatenTotals(logs, []).calories).toBeCloseTo(811.8);
  expect(formatNutritionAmount(total.protein)).toBe('12.4');
  expect(mealNutritionTotals([], 'lunch')).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
});

test('individual target percentages allow zero actual and uncapped progress, but no absent or zero denominators', () => {
  expect(targetPercentage(10, null)).toBeNull();
  expect(targetPercentage(10, undefined)).toBeNull();
  expect(targetPercentage(10, 0)).toBeNull();
  expect(targetPercentage(0, 20)).toBe(0);
  expect(targetPercentage(30, 20)).toBe(150);
  expect(targetPercentage(.75, .5)).toBe(150);
});

test('macro energy uses grams only and has an explicit empty result', () => {
  const shares = macroEnergyShares({ protein: 10, carbs: 20, fat: 10 })!;
  expect(shares.protein).toBeCloseTo(40 / 210 * 100);
  expect(shares.carbs).toBeCloseTo(80 / 210 * 100);
  expect(shares.fat).toBeCloseTo(90 / 210 * 100);
  expect(macroEnergyShares({ protein: 0, carbs: 0, fat: 0 })).toBeNull();
});

test('nutrientGroupCoverage counts only known nutrients per group', () => {
  const totals = Object.fromEntries(NUTRIENTS.map((n) => [n.id, { total: null, knownCount: 0, missingCount: 0 }])) as never as Parameters<typeof nutrientGroupCoverage>[0];
  expect(nutrientGroupCoverage(totals, 'minerals')).toEqual({ known: 0, total: NUTRIENTS.filter((n) => n.group === 'minerals').length });
  totals.fiber = { total: 0, knownCount: 1, missingCount: 0 };
  totals.sugar = { total: null, knownCount: 0, missingCount: 2 };
  totals.sodium = { total: 5, knownCount: 2, missingCount: 1 };
  expect(nutrientGroupCoverage(totals, 'extended_macros').known).toBe(1);
  expect(nutrientGroupCoverage(totals, 'minerals').known).toBe(1);
  expect(nutrientGroupCoverage(totals, 'vitamins').known).toBe(0);
});

test('calorieDelta reports left or over only for a positive target', () => {
  expect(calorieDelta(100, null)).toBeNull();
  expect(calorieDelta(100, 0)).toBeNull();
  expect(calorieDelta(100, 100)).toEqual({ kind: 'left', value: 0 });
  expect(calorieDelta(80, 100)).toEqual({ kind: 'left', value: 20 });
  expect(calorieDelta(135, 100)).toEqual({ kind: 'over', value: 35 });
});


test('macroCalories uses 4 / 4 / 9 without rounding', () => {
  expect(macroCalories({ protein: 10, carbs: 20, fat: 5 })).toBe(165);
  expect(macroCalories({ protein: 0.5, carbs: 0.25, fat: 0.1 })).toBeCloseTo(3.9, 10);
  expect(macroCalories({ protein: 0, carbs: 0, fat: 0 })).toBe(0);
});

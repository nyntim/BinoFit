import { newFoodStatus, sumPlannedTotals } from '@/lib/nutrition-totals';
import { isSlotEaten, logsForSlot, slotCalories, sumEatenTotals } from '@/lib/nutrition-totals';

const log = (meal_slot: any, serving_amount: number, cal = 100, p = 10, c = 20, f = 5) => ({
  meal_slot,
  serving_amount,
  food_calories: cal,
  food_protein: p,
  food_carbs: c,
  food_fat: f,
});
const conf = (meal_slot: any, confirmed: boolean) => ({ meal_slot, confirmed });

describe('isSlotEaten', () => {
  it('treats a slot with no row as eaten', () => {
    expect(isSlotEaten([], 'breakfast')).toBe(true);
  });
  it('returns false when the slot row has confirmed=false', () => {
    expect(isSlotEaten([conf('lunch', false)], 'lunch')).toBe(false);
  });
  it('returns true when the slot row has confirmed=true', () => {
    expect(isSlotEaten([conf('lunch', true)], 'lunch')).toBe(true);
  });
  it('ignores other slots rows', () => {
    expect(isSlotEaten([conf('dinner', false)], 'lunch')).toBe(true);
  });
});

describe('sumEatenTotals', () => {
  it('returns zeros for no logs', () => {
    expect(sumEatenTotals([], [])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });
  it('excludes planned slots', () => {
    const res = sumEatenTotals(
      [log('breakfast', 1), log('lunch', 1)],
      [conf('lunch', false)]
    );
    expect(res).toEqual({ calories: 100, protein: 10, carbs: 20, fat: 5 });
  });
  it('includes slots that have no status row', () => {
    const res = sumEatenTotals([log('snack', 1)], [conf('dinner', false)]);
    expect(res.calories).toBe(100);
  });
  it('returns zeros when every slot is planned', () => {
    const res = sumEatenTotals([log('lunch', 2)], [conf('lunch', false)]);
    expect(res).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });
  it('multiplies by serving_amount, including fractional servings', () => {
    const res = sumEatenTotals([log('breakfast', 2), log('breakfast', 0.5)], []);
    expect(res).toEqual({ calories: 250, protein: 25, carbs: 50, fat: 12.5 });
  });
});

describe('logsForSlot / slotCalories', () => {
  it('logsForSlot returns only logs of the requested slot, in order', () => {
    const a = log('lunch', 1);
    const b = log('dinner', 1);
    const c = log('lunch', 2);
    expect(logsForSlot([a, b, c], 'lunch')).toEqual([a, c]);
  });
  it('logsForSlot returns [] for an empty list or a slot with no logs', () => {
    expect(logsForSlot([], 'breakfast')).toEqual([]);
    expect(logsForSlot([log('lunch', 1)], 'breakfast')).toEqual([]);
  });
  it('logsForSlot returns [] for an unknown slot', () => {
    expect(logsForSlot([log('lunch', 1)], 'brunch' as any)).toEqual([]);
  });
  it('slotCalories is 0 for empty logs, empty slot, or unknown slot', () => {
    expect(slotCalories([], 'lunch')).toBe(0);
    expect(slotCalories([log('dinner', 1)], 'lunch')).toBe(0);
    expect(slotCalories([log('lunch', 1)], 'nope' as any)).toBe(0);
  });
  it('slotCalories multiplies by fractional serving_amount and sums only that slot', () => {
    const logs = [log('lunch', 1.5, 200), log('lunch', 0.5, 100), log('dinner', 3, 999)];
    expect(slotCalories(logs, 'lunch')).toBe(350);
  });
  it('slotCalories is not rounded', () => {
    expect(slotCalories([log('snack', 0.333, 100)], 'snack')).toBeCloseTo(33.3, 5);
    expect(slotCalories([log('snack', 0.333, 100)], 'snack')).not.toBe(33);
  });
  it('slotCalories includes planned-slot logs (ignores confirmations)', () => {
    expect(slotCalories([log('lunch', 2, 150)], 'lunch')).toBe(300);
    expect(sumEatenTotals([log('lunch', 2, 150)], [conf('lunch', false)]).calories).toBe(0);
  });
});

describe('logTotals', () => {
  const { logTotals } = require('@/lib/nutrition-totals');
  it('multiplies food values by servings without rounding', () => {
    const t = logTotals(log('b', 0.35, 123, 7.77, 11.11, 3.33));
    expect(t.calories).toBeCloseTo(43.05, 10);
    expect(t.protein).toBeCloseTo(2.7195, 10);
    expect(t.carbs).toBeCloseTo(3.8885, 10);
    expect(t.fat).toBeCloseTo(1.1655, 10);
  });
  it('returns zeros for zero servings', () => {
    expect(logTotals(log('b', 0))).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });
  it('matches sumEatenTotals for a single eaten log', () => {
    const l = log('b', 1.5);
    expect(sumEatenTotals([l], [])).toEqual(logTotals(l));
  });
});

describe('nutrient coverage totals', () => {
  const { normalizeNutrients } = require('@/lib/nutrients');
  const { sumNutrientTotals, slotNutrientTotals, sumEatenNutrientTotals } = require('@/lib/nutrition-totals');
  const nutrientLog = (over: Record<string, unknown> = {}) => ({
    meal_slot: 'lunch', serving_amount: .5, food_nutrients: normalizeNutrients({ fiber: 2, sugar: 0, b12: .000001 }), ...over,
  });
  it('scales the saved 50g / 100g multiplier once and counts duplicate items', () => {
    const logs = [nutrientLog(), nutrientLog(), nutrientLog({ food_nutrients: undefined })];
    expect(sumNutrientTotals(logs).fiber).toEqual({ total: 2, knownCount: 2, missingCount: 1 });
    expect(sumNutrientTotals(logs).sugar).toEqual({ total: 0, knownCount: 2, missingCount: 1 });
    expect(sumNutrientTotals(logs).b12.total).toBe(.000001);
    expect(sumNutrientTotals(logs).iron).toEqual({ total: null, knownCount: 0, missingCount: 3 });
    expect(sumNutrientTotals([nutrientLog({ serving_amount: 28.3495 / 100 })]).fiber.total).toBe(2 * 28.3495 / 100);
  });
  it('planned slots affect meal coverage only; tombstones never count', () => {
    const logs = [nutrientLog(), nutrientLog({ meal_slot: 'dinner' }), nutrientLog({ deleted_at: 'now' })];
    expect(slotNutrientTotals(logs, 'lunch').fiber.knownCount).toBe(1);
    expect(sumEatenNutrientTotals(logs, [{ meal_slot: 'lunch', confirmed: false }]).fiber.total).toBe(1);
    expect(sumEatenNutrientTotals(logs, []).fiber.total).toBe(2);
    expect(sumNutrientTotals([]).fiber).toEqual({ total: null, knownCount: 0, missingCount: 0 });
    expect(sumNutrientTotals([nutrientLog({ serving_amount: NaN })]).fiber).toEqual({ total: null, knownCount: 0, missingCount: 1 });
  });
});


describe('sumPlannedTotals', () => {
  test('no rows means nothing is planned', () => {
    expect(sumPlannedTotals([log('lunch', 1)], [])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });
  test('an explicit unconfirmed slot counts; eaten and missing-row slots do not', () => {
    const logs = [log('lunch', 2), log('dinner', 1), log('snack', 1)];
    const confirmations = [conf('lunch', false), conf('dinner', true)];
    expect(sumPlannedTotals(logs, confirmations)).toEqual({ calories: 200, protein: 20, carbs: 40, fat: 10 });
  });
  test('planned plus eaten equals everything logged', () => {
    const logs = [log('lunch', 2), log('dinner', 1.5), log('snack', 1)];
    const confirmations = [conf('lunch', false)];
    const planned = sumPlannedTotals(logs, confirmations);
    const eaten = sumEatenTotals(logs, confirmations);
    expect(planned.calories + eaten.calories).toBe(sumEatenTotals(logs, []).calories);
  });
});

describe('newFoodStatus', () => {
  test('an existing row wins over the default in both directions', () => {
    expect(newFoodStatus([conf('lunch', false)], 'lunch', 'eaten')).toBe('planned');
    expect(newFoodStatus([conf('lunch', true)], 'lunch', 'planned')).toBe('eaten');
  });
  test('with no row for the slot the default applies', () => {
    expect(newFoodStatus([conf('dinner', false)], 'lunch', 'planned')).toBe('planned');
    expect(newFoodStatus([], 'lunch', 'eaten')).toBe('eaten');
  });
  test('an edit keeps the slot status through isSlotEaten', () => {
    expect(isSlotEaten([conf('lunch', false)], 'lunch')).toBe(false);
  });
});

import { isSlotEaten, sumEatenTotals } from '@/lib/nutrition-totals';

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

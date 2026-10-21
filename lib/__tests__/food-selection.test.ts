import {
  applyResolved, batchTotals, buildBatchItems, canConfirm, clearSelection, emptySelection, isSelected,
  itemTotals, itemValidation, markResolving, removeFood, selectedCount, setItemAmount, setItemUnit, toggleFood,
  type SelectionState,
} from '@/lib/food-selection';
import { servingMultiplier } from '@/lib/food-validation';
import type { Food } from '@/lib/types';

const food = (id: string, over: Partial<Food> = {}): Food => ({
  id, name: id, brand: null, serving_units: '100g', calories: 155, protein: 12.34, carbs: 1.26, fat: 10.05,
  source: 'usda', updated_at: 'x', ...over,
} as Food);
const ctx = { meal_slot: 'm1', date: '2026-10-20' };
const ready = (s: SelectionState) => s.order.reduce((acc, id) => applyResolved(acc, id, acc.items[id].token, acc.items[id].food), s);

describe('selection draft', () => {
  it('toggles by id: one item across sections, toggling again removes, order is selection order', () => {
    let s = emptySelection(ctx);
    s = toggleFood(s, food('a')); s = toggleFood(s, food('b')); s = toggleFood(s, food('a', { name: 'refreshed' }));
    expect(s.order).toEqual(['b']);
    s = toggleFood(s, food('a'));
    expect(s.order).toEqual(['b', 'a']);
    expect(isSelected(s, 'a')).toBe(true);
    expect(selectedCount(s)).toBe(2);
  });

  it('uses the initial amount or defaults to 1 serving', () => {
    expect(toggleFood(emptySelection(ctx), food('a'), 2).items.a).toMatchObject({ amount: '2', unit: 'default' });
    expect(toggleFood(emptySelection(ctx), food('a')).items.a).toMatchObject({ amount: '1', unit: 'default' });
  });

  it('converts the amount between units and round trips', () => {
    let s = toggleFood(emptySelection(ctx), food('a', { serving_units: '50 g' }));
    s = setItemAmount(s, 'a', '2');
    s = setItemUnit(s, 'a', 'grams');
    expect(s.items.a.amount).toBe('100');
    s = setItemUnit(s, 'a', 'oz');
    expect(itemValidation(s.items.a).multiplier).toBeCloseTo(servingMultiplier(2, 'default', 50), 6);
    s = setItemUnit(s, 'a', 'default');
    expect(Number(s.items.a.amount)).toBeCloseTo(2, 6);
  });

  it('keeps invalid text on unit change and keeps weightless foods on the default unit', () => {
    let s = toggleFood(emptySelection(ctx), food('a'));
    s = setItemAmount(s, 'a', 'abc');
    s = setItemUnit(s, 'a', 'grams');
    expect(s.items.a).toMatchObject({ amount: 'abc', unit: 'grams' });
    let w = toggleFood(emptySelection(ctx), food('w', { serving_units: '1 slice' }));
    w = setItemUnit(w, 'w', 'grams');
    expect(w.items.w.unit).toBe('default');
  });

  it('validates with serving messages', () => {
    let s = toggleFood(emptySelection(ctx), food('a'));
    const err = (raw: string) => itemValidation(setItemAmount(s, 'a', raw).items.a).error;
    expect(err('')).toBe('Enter a number.');
    expect(err('0')).toBe('Enter at least 0.01 servings.');
    expect(err('0.005')).toBe('Enter at least 0.01 servings.');
    expect(err('101')).toMatch(/or less/);
    expect(err('1,5')).toBeNull();
    s = setItemAmount(s, 'a', '1');
  });

  it('rounds totals like the serving picker and updates on remove and clear', () => {
    let s = ready(toggleFood(toggleFood(emptySelection(ctx), food('a')), food('b')));
    s = setItemAmount(s, 'a', '1.5');
    expect(itemTotals(s.items.a)).toEqual({ calories: 233, protein: 18.5, carbs: 1.9, fat: 15.1 });
    expect(batchTotals(s)).toEqual({ calories: 388, protein: 30.8, carbs: 3.2, fat: 25.2 });
    s = removeFood(s, 'a');
    expect(batchTotals(s).calories).toBe(155);
    expect(batchTotals(clearSelection(s))).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it('ignores stale or removed resolves and keeps amount and unit on a new serving size', () => {
    let s = toggleFood(emptySelection(ctx), food('a'));
    s = setItemAmount(s, 'a', '3');
    s = markResolving(s, 'a');
    const stale = s.items.a.token - 1;
    expect(applyResolved(s, 'a', stale, food('a'))).toBe(s);
    expect(applyResolved(removeFood(s, 'a'), 'a', 1, food('a')).order).toEqual([]);
    s = applyResolved(s, 'a', s.items.a.token, food('a', { serving_units: '1 cup' }));
    expect(s.items.a).toMatchObject({ amount: '3', unit: 'default', status: 'ready' });
    expect(s.items.a.food.serving_units).toBe('1 cup');
  });

  it('canConfirm needs a non-empty, all ready, all valid draft', () => {
    expect(canConfirm(emptySelection(ctx))).toBe(false);
    let s = toggleFood(emptySelection(ctx), food('a'));
    expect(canConfirm(s)).toBe(false);
    expect(canConfirm(applyResolved(s, 'a', 1, null))).toBe(false);
    s = ready(s);
    expect(canConfirm(s)).toBe(true);
    expect(canConfirm(setItemAmount(s, 'a', '0'))).toBe(false);
  });

  it('builds batch items with the multiplier and the food serving units', () => {
    let s = ready(toggleFood(emptySelection(ctx), food('a', { serving_units: '50 g' })));
    s = setItemUnit(s, 'a', 'grams');
    s = setItemAmount(s, 'a', '100');
    expect(buildBatchItems(s)).toEqual([{ food_id: 'a', serving_amount: 2, serving_unit: '50 g' }]);
    expect(() => buildBatchItems(emptySelection(ctx))).toThrow();
  });
});

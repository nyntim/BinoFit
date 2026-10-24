import { NUTRIENTS } from '@/lib/nutrients';
import { logsForSlot, sumEatenTotals, type NutritionTotals, type NutrientTotals } from '@/lib/nutrition-totals';
import type { FoodLogWithFood, MealSlot } from '@/lib/types';

/** A meal includes planned food; rounding belongs only in display. */
export function mealNutritionTotals(logs: FoodLogWithFood[], slot: MealSlot): NutritionTotals {
  return sumEatenTotals(logsForSlot(logs, slot), []);
}

export function targetPercentage(amount: number, target: number | null | undefined): number | null {
  return target != null && target > 0 ? amount / target * 100 : null;
}

/** Energy of a macro split at 4 / 4 / 9 kcal per gram, unrounded. */
export function macroCalories({ protein, carbs, fat }: Pick<NutritionTotals, 'protein' | 'carbs' | 'fat'>): number {
  return protein * 4 + carbs * 4 + fat * 9;
}

export function macroEnergyShares({ protein, carbs, fat }: Pick<NutritionTotals, 'protein' | 'carbs' | 'fat'>) {
  const energy = macroCalories({ protein, carbs, fat });
  return energy > 0 ? { protein: protein * 4 / energy * 100, carbs: carbs * 4 / energy * 100, fat: fat * 9 / energy * 100 } : null;
}

export function formatNutritionAmount(amount: number, precision = 1): string {
  return String(Number(amount.toFixed(precision)));
}

/** Catalog items in a group that have at least one known value, out of the group size. */
export function nutrientGroupCoverage(nutrients: NutrientTotals, group: (typeof NUTRIENTS)[number]['group']): { known: number; total: number } {
  const items = NUTRIENTS.filter((n) => n.group === group);
  return { known: items.filter((n) => nutrients[n.id].knownCount > 0 && nutrients[n.id].total != null).length, total: items.length };
}

/** Calories left or over a positive target; null without one. Exactly on target is "left 0". */
export function calorieDelta(consumed: number, target: number | null | undefined): { kind: 'left' | 'over'; value: number } | null {
  if (target == null || target <= 0) return null;
  return consumed > target ? { kind: 'over', value: consumed - target } : { kind: 'left', value: target - consumed };
}

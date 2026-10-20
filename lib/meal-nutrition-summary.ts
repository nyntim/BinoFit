import { logsForSlot, sumEatenTotals, type NutritionTotals } from '@/lib/nutrition-totals';
import type { FoodLogWithFood, MealSlot } from '@/lib/types';

/** A meal includes planned food; rounding belongs only in display. */
export function mealNutritionTotals(logs: FoodLogWithFood[], slot: MealSlot): NutritionTotals {
  return sumEatenTotals(logsForSlot(logs, slot), []);
}

export function targetPercentage(amount: number, target: number | null | undefined): number | null {
  return target != null && target > 0 ? amount / target * 100 : null;
}

export function macroEnergyShares({ protein, carbs, fat }: Pick<NutritionTotals, 'protein' | 'carbs' | 'fat'>) {
  const energy = protein * 4 + carbs * 4 + fat * 9;
  return energy > 0 ? { protein: protein * 4 / energy * 100, carbs: carbs * 4 / energy * 100, fat: fat * 9 / energy * 100 } : null;
}

export function formatNutritionAmount(amount: number, precision = 1): string {
  return String(Number(amount.toFixed(precision)));
}

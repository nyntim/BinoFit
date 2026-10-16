import type { FoodLogWithFood, MealSlot, MealSlotConfirmation } from '@/lib/types';

export type NutritionTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

/** A slot with no status row counts as eaten. */
export function isSlotEaten(
  confirmations: Pick<MealSlotConfirmation, 'meal_slot' | 'confirmed'>[],
  slot: MealSlot
): boolean {
  const conf = confirmations.find((c) => c.meal_slot === slot);
  return conf ? conf.confirmed : true;
}

type LogMacros = Pick<
  FoodLogWithFood,
  'serving_amount' | 'food_calories' | 'food_protein' | 'food_carbs' | 'food_fat'
>;

/** Unrounded nutrition of one log: food_* x serving_amount. */
export function logTotals(log: LogMacros): NutritionTotals {
  return {
    calories: log.food_calories * log.serving_amount,
    protein: log.food_protein * log.serving_amount,
    carbs: log.food_carbs * log.serving_amount,
    fat: log.food_fat * log.serving_amount,
  };
}

/** Sums food_* x serving_amount over logs in eaten slots only. */
export function sumEatenTotals(
  logs: (Pick<FoodLogWithFood, 'meal_slot'> & LogMacros)[],
  confirmations: Pick<MealSlotConfirmation, 'meal_slot' | 'confirmed'>[]
): NutritionTotals {
  return logs.reduce<NutritionTotals>(
    (acc, log) => {
      if (!isSlotEaten(confirmations, log.meal_slot)) return acc;
      const t = logTotals(log);
      return {
        calories: acc.calories + t.calories,
        protein: acc.protein + t.protein,
        carbs: acc.carbs + t.carbs,
        fat: acc.fat + t.fat,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

/** Logs belonging to one meal slot. */
export function logsForSlot<T extends Pick<FoodLogWithFood, 'meal_slot'>>(
  logs: T[],
  slot: MealSlot
): T[] {
  return logs.filter((l) => l.meal_slot === slot);
}

/** Unrounded calories of one meal slot, regardless of eaten/planned status. */
export function slotCalories(
  logs: Pick<FoodLogWithFood, 'meal_slot' | 'serving_amount' | 'food_calories'>[],
  slot: MealSlot
): number {
  return logsForSlot(logs, slot).reduce((sum, l) => sum + l.food_calories * l.serving_amount, 0);
}

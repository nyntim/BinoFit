import { NUTRIENT_IDS, scaleNutrients, type NutrientId } from '@/lib/nutrients';
import type { FoodLogWithFood, LogStatus, MealSlot, MealSlotConfirmation } from '@/lib/types';

export type NutritionTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

/** A slot with no status row counts as eaten. */
export function isSlotEaten(
  confirmations: readonly Pick<MealSlotConfirmation, 'meal_slot' | 'confirmed'>[],
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

/** Mirror of `sumEatenTotals`: food_* x serving_amount over logs in planned slots only. */
export function sumPlannedTotals(
  logs: (Pick<FoodLogWithFood, 'meal_slot'> & LogMacros)[],
  confirmations: Pick<MealSlotConfirmation, 'meal_slot' | 'confirmed'>[]
): NutritionTotals {
  return sumEatenTotals(
    logs.filter((log) => !isSlotEaten(confirmations, log.meal_slot)),
    []
  );
}

/**
 * The status food logged to `slot` will get: an existing status row wins, otherwise the
 * default applies (what `ensureMealSlotStatus` does when it inserts the default and keeps an existing row).
 */
export function newFoodStatus(
  confirmations: readonly Pick<MealSlotConfirmation, 'meal_slot' | 'confirmed'>[],
  slot: MealSlot,
  defaultStatus: LogStatus
): LogStatus {
  const conf = confirmations.find((c) => c.meal_slot === slot);
  return conf ? (conf.confirmed ? 'eaten' : 'planned') : defaultStatus;
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

export type NutrientTotal = { total: number | null; knownCount: number; missingCount: number };
export type NutrientTotals = Record<NutrientId, NutrientTotal>;
type NutrientLog = Pick<FoodLogWithFood, 'serving_amount' | 'food_nutrients' | 'deleted_at'>;

/** Values use the stored base-serving multiplier exactly once; coverage counts log items. */
export function sumNutrientTotals(logs: readonly NutrientLog[]): NutrientTotals {
  const totals = Object.fromEntries(NUTRIENT_IDS.map((id) => [id, { total: null, knownCount: 0, missingCount: 0 }])) as NutrientTotals;
  for (const log of logs) {
    if (log.deleted_at != null) continue;
    const scaled = scaleNutrients(log.food_nutrients, log.serving_amount);
    for (const id of NUTRIENT_IDS) {
      const value = scaled[id];
      const item = totals[id];
      const next = (item.total ?? 0) + (value ?? 0);
      if (value == null || !Number.isFinite(next)) item.missingCount++;
      else { item.total = next; item.knownCount++; }
    }
  }
  return totals;
}
export function slotNutrientTotals(logs: readonly (NutrientLog & Pick<FoodLogWithFood, 'meal_slot'>)[], slot: MealSlot): NutrientTotals {
  return sumNutrientTotals(logs.filter((log) => log.meal_slot === slot));
}
export function sumEatenNutrientTotals(logs: readonly (NutrientLog & Pick<FoodLogWithFood, 'meal_slot'>)[], confirmations: readonly Pick<MealSlotConfirmation, 'meal_slot' | 'confirmed'>[]): NutrientTotals {
  return sumNutrientTotals(logs.filter((log) => isSlotEaten(confirmations, log.meal_slot)));
}

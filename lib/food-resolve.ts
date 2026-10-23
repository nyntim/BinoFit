// Resolves a search-result food to a full, locally cached row before it can be logged in a batch.
// Mirrors the serving picker's loader without changing it. Never throws.
import { cacheRemoteFood, getFoodById, hasAnyMicros } from '@/lib/database';
import { getUSDAFoodById } from '@/lib/foods-db';
import { getFullBrandedFood } from '@/lib/food-service';
import type { Food } from '@/lib/types';

/** Search summaries need full details, regardless of their source. Includes legacy cached rows. */
export function needsRemoteDetails(food: Food): boolean {
  return (
    food.detailsPending === true ||
    food.source === 'branded' ||
    (!food.source?.startsWith('usda') &&
      !food.source?.startsWith('custom') &&
      food.source !== 'open_food_facts' &&
      Boolean(food.brand))
  );
}

export async function resolveLoggableFood(food: Food): Promise<Food | null> {
  try {
    const local = await getFoodById(food.id);
    if (needsRemoteDetails(food)) {
      const full = await getFullBrandedFood(food.id);
      if (full) return full;
      // Offline: only a row that was fully fetched earlier counts as resolved.
      return local && hasAnyMicros(local) ? local : null;
    }
    if (food.source?.startsWith('usda')) {
      if (local && hasAnyMicros(local)) return local;
      const usda = await getUSDAFoodById(food.id);
      if (usda) {
        await cacheRemoteFood(usda);
        return usda;
      }
      return local;
    }
    return local;
  } catch {
    return null;
  }
}

import { searchFoods } from '@/lib/database';
import { cacheRemoteFood } from '@/lib/database';
import { supabase } from '@/lib/supabase';
import type { Food } from '@/lib/types';

const MIN_REMOTE_QUERY_LENGTH = 4;

/**
 * Search foods locally first. Falls back to Supabase only when local returns
 * zero results and the query is at least 4 characters. Any remote results are
 * cached into local SQLite so the next search is free.
 */
export async function searchFoodsWithFallback(query: string): Promise<Food[]> {
  const localResults = await searchFoods(query);

  if (localResults.length > 0 || query.trim().length < MIN_REMOTE_QUERY_LENGTH) {
    return localResults;
  }

  const { data, error } = await supabase
    .from('foods')
    .select('*')
    .or(`name.ilike.%${query}%,brand.ilike.%${query}%`)
    .limit(20);

  if (error || !data) return localResults;

  const remoteResults = data as Food[];

  // Cache each new remote food locally (INSERT OR IGNORE so existing rows are not overwritten)
  await Promise.all(remoteResults.map((food) => cacheRemoteFood(food).catch(() => {})));

  // Deduplicate by id against local results (which may be empty here, but keeps it safe)
  const localIds = new Set(localResults.map((f) => f.id));
  const merged = [
    ...localResults,
    ...remoteResults.filter((f) => !localIds.has(f.id)),
  ];

  return merged;
}

/**
 * Save a newly created custom food to Supabase so it survives reinstall.
 * Fire-and-forget — callers must NOT await this.
 */
export async function saveCustomFoodToSupabase(food: Food, deviceId: string): Promise<void> {
  await supabase.from('foods').upsert(
    {
      id: food.id,
      name: food.name,
      brand: food.brand,
      serving_units: food.serving_units,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      source: 'custom',
      user_id: deviceId,
      updated_at: food.updated_at,
    },
    { onConflict: 'id' }
  );
}

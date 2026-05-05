import { searchFoods, cacheRemoteFood } from '@/lib/database';
import { searchUSDAFoods } from '@/lib/foods-db';
import { supabase } from '@/lib/supabase';
import type { Food } from '@/lib/types';

const MIN_REMOTE_QUERY_LENGTH = 4;

function dedup(existing: Food[], additions: Food[]): Food[] {
  const ids = new Set(existing.map((f) => f.id));
  return additions.filter((f) => !ids.has(f.id));
}

/**
 * Three-tier search: user-local DB → bundled USDA dataset → Supabase remote.
 * Each tier only fires when previous tiers returned nothing.
 * Remote results are cached locally so subsequent searches are instant.
 */
export async function searchFoodsWithFallback(query: string): Promise<Food[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const localResults = await searchFoods(trimmed);
  if (localResults.length > 0) return localResults;

  const usdaResults = await searchUSDAFoods(trimmed);
  if (usdaResults.length > 0) return usdaResults;

  if (trimmed.length < MIN_REMOTE_QUERY_LENGTH) return [];

  const { data, error } = await supabase
    .from('foods')
    .select('*')
    .or(`name.ilike.%${query}%,brand.ilike.%${query}%`)
    .limit(20);

  if (error || !data) return [];

  const remoteResults = data as Food[];

  await Promise.all(remoteResults.map((food) => cacheRemoteFood(food).catch(() => {})));

  return dedup(localResults, remoteResults);
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

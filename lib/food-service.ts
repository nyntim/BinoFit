import { searchFoods, cacheRemoteFood } from '@/lib/database';
import { searchUSDAFoods } from '@/lib/foods-db';
import { supabase } from '@/lib/supabase';
import type { Food } from '@/lib/types';

const MIN_BRANDED_QUERY_LENGTH = 3;
const BRANDED_LIMIT = 8;
const AUTO_FETCH_THRESHOLD = 8;

function dedup(primary: Food[], secondary: Food[]): Food[] {
  const ids = new Set(primary.map((f) => f.id));
  return secondary.filter((f) => !ids.has(f.id));
}

/**
 * Run fitness.db + foods.db searches in parallel and merge results.
 * fitness.db results take priority (user's own foods first).
 */
export async function searchLocal(query: string): Promise<Food[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const [userFoods, usdaFoods] = await Promise.all([
    searchFoods(trimmed),
    searchUSDAFoods(trimmed),
  ]);

  return [...userFoods, ...dedup(userFoods, usdaFoods)];
}

/**
 * Query Supabase for branded foods, excluding any IDs already in local results.
 */
export async function searchBranded(
  query: string,
  excludeIds: string[] = []
): Promise<Food[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_BRANDED_QUERY_LENGTH) return [];

  const { data, error } = await supabase
    .from('foods')
    .select('*')
    .or(`name.ilike.%${trimmed}%,brand.ilike.%${trimmed}%`)
    .limit(BRANDED_LIMIT);

  if (error || !data) return [];

  const exclude = new Set(excludeIds);
  return (data as Food[]).filter((f) => !exclude.has(f.id));
}

/**
 * Whether the UI should automatically fetch branded results
 * (only when local results are sparse).
 */
export function shouldAutoFetchBranded(localCount: number): boolean {
  return localCount < AUTO_FETCH_THRESHOLD;
}

/**
 * Fetch full food profile from Supabase by ID and cache it locally.
 * Use when the user taps a branded result that hasn't been cached yet.
 */
export async function getFullBrandedFood(id: string): Promise<Food | null> {
  const { data, error } = await supabase
    .from('foods')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;

  const food = data as Food;
  await cacheRemoteFood(food).catch(() => {});
  return food;
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

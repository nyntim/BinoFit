import { getDatabase, searchFoods, cacheRemoteFood } from '@/lib/database';
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
 * Uses strict column selection to minimize egress and background caches results.
 */
export async function searchBranded(
  query: string,
  excludeIds: string[] = []
): Promise<Food[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_BRANDED_QUERY_LENGTH) return [];

  try {
    let queryBuilder = supabase
      .from('foods')
      .select('id, name, brand, calories, protein, carbs, fat, serving_units')
      .or(`name.ilike.%${trimmed}%,brand.ilike.%${trimmed}%`)
      .limit(BRANDED_LIMIT);

    if (excludeIds.length > 0) {
      queryBuilder = queryBuilder.not('id', 'in', `(${excludeIds.join(',')})`);
    }

    const { data, error } = await queryBuilder;

    if (error || !data) return [];

    const branded = data as Food[];

    // Background caching of partial results to speed up future local searches
    Promise.all(
      branded.map((food) =>
        cacheRemoteFood({
          ...food,
          source: 'branded',
          updated_at: new Date().toISOString(),
        }).catch(() => {})
      )
    );

    return branded;
  } catch {
    return []; // Silent failure
  }
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
  try {
    const { data, error } = await supabase
      .from('foods')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;

    const fullFood = data as Food;

    // Cache/Overwrite with complete row using REPLACE logic for full profile
    const db = await getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO foods (id, name, brand, serving_units, calories, protein, carbs, fat, source, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fullFood.id,
        fullFood.name,
        fullFood.brand,
        fullFood.serving_units,
        fullFood.calories,
        fullFood.protein,
        fullFood.carbs,
        fullFood.fat,
        fullFood.source || 'branded',
        fullFood.updated_at || new Date().toISOString(),
      ]
    );

    return fullFood;
  } catch {
    return null; // Silent failure
  }
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

import { getDatabase, searchFoods, cacheRemoteFood } from '@/lib/database';
import { searchUSDAFoods } from '@/lib/foods-db';
import { supabase } from '@/lib/supabase';
import type { Food } from '@/lib/types';

const MIN_REMOTE_QUERY_LENGTH = 3;

export interface SearchResults {
  local: Food[];
  branded: Food[];
  shouldAutoFetch: boolean;
}

function dedup(existing: Food[], additions: Food[]): Food[] {
  const ids = new Set(existing.map((f) => f.id));
  return additions.filter((f) => !ids.has(f.id));
}

/**
 * Enhanced search system:
 * 1. Parallel local search (personal/cached + USDA).
 * 2. Auto-fetch from Supabase only if local results < 8 and query >= 3 chars.
 * 3. Strict column selection for branded search to minimize egress.
 * 4. Silent failure for remote queries.
 */
export async function searchFoodsWithFallback(query: string): Promise<SearchResults> {
  const trimmed = query.trim();
  if (!trimmed) return { local: [], branded: [], shouldAutoFetch: false };

  // 1. Parallel local search (fitness.db + foods.db)
  const [personalResults, usdaResults] = await Promise.all([
    searchFoods(trimmed),
    searchUSDAFoods(trimmed),
  ]);

  const localResults = dedup(personalResults, usdaResults);
  
  const canFetchBranded = trimmed.length >= MIN_REMOTE_QUERY_LENGTH;
  const shouldAutoFetch = canFetchBranded && localResults.length < 8;

  let branded: Food[] = [];
  if (shouldAutoFetch) {
    branded = await fetchBrandedFoods(trimmed, localResults.map((f) => f.id));
  }

  return {
    local: localResults,
    branded,
    shouldAutoFetch: canFetchBranded && localResults.length >= 8,
  };
}

/**
 * Fetch branded foods from Supabase with strict column selection.
 * Limits to 8 results and excludes already found local IDs.
 */
export async function fetchBrandedFoods(query: string, excludeIds: string[]): Promise<Food[]> {
  try {
    let queryBuilder = supabase
      .from('foods')
      .select('id, name, brand, calories, protein, carbs, fat, serving_units')
      .or(`name.ilike.%${query}%,brand.ilike.%${query}%`)
      .limit(8);

    if (excludeIds.length > 0) {
      queryBuilder = queryBuilder.not('id', 'in', `(${excludeIds.join(',')})`);
    }

    const { data, error } = await queryBuilder;

    if (error || !data) return [];

    const branded = data as Food[];

    // Background caching of partial results
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
 * Fetch the complete nutrient profile for a single food and cache it.
 * Called only when a branded food is selected.
 */
export async function fetchFullFoodProfile(foodId: string): Promise<Food | null> {
  try {
    const { data, error } = await supabase
      .from('foods')
      .select('*')
      .eq('id', foodId)
      .single();

    if (error || !data) return null;

    const fullFood = data as Food;

    // Cache/Overwrite with complete row
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
        fullFood.source,
        fullFood.updated_at,
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

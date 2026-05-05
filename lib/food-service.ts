import { searchFoods, cacheRemoteFood } from '@/lib/database';
import { searchUSDAFoods } from '@/lib/foods-db';
import { supabase } from '@/lib/supabase';
import type { Food } from '@/lib/types';

const MIN_REMOTE_QUERY_LENGTH = 3;
const AUTO_FETCH_THRESHOLD = 8;
const REMOTE_LIMIT = 8;

export type SearchResults = {
  local: Food[];
  branded: Food[];
  brandedLoading: boolean;
  canLoadMore: boolean;
};

function dedup(foods: Food[]): Food[] {
  const seen = new Set<string>();
  return foods.filter((f) => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });
}

/**
 * Parallel local search: fitness.db (custom + cached) and foods.db (USDA).
 * Deduplicates by ID with fitness.db results taking priority.
 */
export async function searchLocal(query: string): Promise<Food[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const [fitnessResults, usdaResults] = await Promise.all([
    searchFoods(trimmed),
    searchUSDAFoods(trimmed),
  ]);

  return dedup([...fitnessResults, ...usdaResults]);
}

/**
 * Fetch branded foods from Supabase, excluding IDs already found locally.
 * Returns empty array on error (fail silently).
 */
export async function searchBranded(
  query: string,
  excludeIds: string[]
): Promise<Food[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_REMOTE_QUERY_LENGTH) return [];

  try {
    let request = supabase
      .from('foods')
      .select('id, name, brand, serving_units, calories, protein, carbs, fat, source, updated_at')
      .or(`name.ilike.%${trimmed}%,brand.ilike.%${trimmed}%`)
      .limit(REMOTE_LIMIT);

    if (excludeIds.length > 0) {
      request = request.not('id', 'in', `(${excludeIds.join(',')})`);
    }

    const { data, error } = await request;
    if (error || !data) return [];

    return data as Food[];
  } catch {
    return [];
  }
}

/**
 * Whether branded auto-fetch should trigger based on local result count and query length.
 */
export function shouldAutoFetchBranded(query: string, localCount: number): boolean {
  return query.trim().length >= MIN_REMOTE_QUERY_LENGTH && localCount < AUTO_FETCH_THRESHOLD;
}

/**
 * Fetch the full nutrient profile for a single branded food,
 * cache it into fitness.db, and return it.
 */
export async function getFullBrandedFood(id: string): Promise<Food | null> {
  try {
    const { data, error } = await supabase
      .from('foods')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;

    const food: Food = {
      id: data.id,
      name: data.name,
      brand: data.brand ?? null,
      serving_units: data.serving_units ?? '1 serving',
      calories: data.calories ?? 0,
      protein: data.protein ?? 0,
      carbs: data.carbs ?? 0,
      fat: data.fat ?? 0,
      source: data.source ?? 'branded',
      updated_at: data.updated_at ?? new Date().toISOString(),
    };

    await cacheRemoteFood(food);
    return food;
  } catch {
    return null;
  }
}

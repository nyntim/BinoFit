import { 
  getDatabase, 
  searchFoods, 
  searchFoodsByTokens, 
  searchFoodsBySingleToken,
  cacheRemoteFood,
  getFrequentFoods,
  getRecentFoods
} from '@/lib/database';
import { 
  searchUSDAFoods, 
  searchUSDAFoodsByTokens, 
  searchUSDAFoodsBySingleToken 
} from '@/lib/foods-db';
import { supabase } from '@/lib/supabase';
import type { Food } from '@/lib/types';

const MIN_BRANDED_QUERY_LENGTH = 3;
const BRANDED_LIMIT = 8;
const AUTO_FETCH_THRESHOLD = 8;
const LOCAL_SEARCH_THRESHOLD = 20;

const FILLER_WORDS = new Set(['a', 'an', 'the', 'of', 'with', 'and', 'for', 'in', 'on', 'at', 'by', 'to']);

export type ParsedQuery = {
  term: string;
  tokens: string[];
  quantity?: number;
  unit?: string;
};

/**
 * Extracts quantity/unit prefix (e.g. "100g chicken") and strips filler words.
 */
export function parseQuery(raw: string): ParsedQuery {
  let text = raw.trim().toLowerCase();
  let quantity: number | undefined;
  let unit: string | undefined;

  // Pattern for quantity + unit (e.g., "100g", "2 cups", "1.5 oz")
  const qtyPattern = /^(\d*\.?\d+)\s*(g|ml|oz|lb|cups?|tbsps?|tsps?|oz|floz|servings?)\s+(.*)$/i;
  const match = text.match(qtyPattern);

  if (match) {
    quantity = parseFloat(match[1]);
    unit = match[2].toLowerCase();
    text = match[3];
  }

  const allTokens = text.split(/\s+/).filter(Boolean);
  const tokens = allTokens.filter(t => !FILLER_WORDS.has(t));
  
  // If we stripped everything, keep original tokens to avoid empty search
  const finalTokens = tokens.length > 0 ? tokens : allTokens;

  return {
    term: text,
    tokens: finalTokens,
    quantity,
    unit
  };
}

/**
 * Simple trigram similarity (0 to 1) for client-side fuzzy matching.
 */
export function trigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const getTrigrams = (str: string) => {
    const s = `  ${str.toLowerCase()}  `;
    const tri = [];
    for (let i = 0; i < s.length - 2; i++) {
      tri.push(s.substring(i, i + 3));
    }
    return tri;
  };

  const triA = getTrigrams(a);
  const triB = getTrigrams(b);
  const setB = new Set(triB);
  
  let matches = 0;
  for (const t of triA) {
    if (setB.has(t)) matches++;
  }

  return (2 * matches) / (triA.length + triB.length);
}

function dedup(primary: Food[], secondary: Food[]): Food[] {
  const ids = new Set(primary.map((f) => f.id));
  return secondary.filter((f) => !ids.has(f.id));
}

/**
 * Tiered search pipeline:
 * 1. Exact/Prefix (matchTier 1-2)
 * 2. All tokens AND (matchTier 3)
 * 3. Partial tokens (matchTier 4)
 * 4. Fuzzy fallback (matchTier 5)
 */
export async function searchLocal(query: string): Promise<Food[]> {
  const parsed = parseQuery(query);
  if (parsed.tokens.length === 0) return [];

  let results: Food[] = [];

  // Tier 1 & 2: Exact & Prefix (already handled by searchFoods/searchUSDAFoods)
  const [t12User, t12USDA] = await Promise.all([
    searchFoods(parsed.term),
    searchUSDAFoods(parsed.term),
  ]);
  
  results = [...t12User, ...dedup(t12User, t12USDA)];

  if (results.length >= LOCAL_SEARCH_THRESHOLD) return results;

  // Tier 3: All tokens in any order
  const [t3User, t3USDA] = await Promise.all([
    searchFoodsByTokens(parsed.tokens),
    searchUSDAFoodsByTokens(parsed.tokens),
  ]);
  
  results = [...results, ...dedup(results, [...t3User, ...dedup(t3User, t3USDA)])];

  if (results.length >= LOCAL_SEARCH_THRESHOLD) return results;

  // Tier 4: Partial token match (at least one significant token)
  // We use the first token as a representative for this tier
  if (parsed.tokens.length > 0) {
    const [t4User, t4USDA] = await Promise.all([
      searchFoodsBySingleToken(parsed.tokens[0]),
      searchUSDAFoodsBySingleToken(parsed.tokens[0]),
    ]);
    results = [...results, ...dedup(results, [...t4User, ...dedup(t4User, t4USDA)])];
  }

  if (results.length >= LOCAL_SEARCH_THRESHOLD) return results;

  // Tier 5: Fuzzy fallback
  // If still low on results, we could do a broader search and sort by trigram
  // For now, we'll let Tier 4 be the floor, or we could add a specific fuzzy check if needed.
  
  return results;
}

export type SortOption = 'best' | 'frequent' | 'recent' | 'az' | 'za';

/**
 * Re-sorts a result set in-memory based on user preference.
 */
export async function sortFoodResults(
  foods: Food[], 
  option: SortOption
): Promise<Food[]> {
  if (foods.length <= 1) return foods;

  switch (option) {
    case 'az':
      return [...foods].sort((a, b) => a.name.localeCompare(b.name));
    case 'za':
      return [...foods].sort((a, b) => b.name.localeCompare(a.name));
    case 'frequent': {
      const frequent = await getFrequentFoods(100);
      const freqMap = new Map(frequent.map(f => [f.id, (f as any).log_count || 0]));
      return [...foods].sort((a, b) => (freqMap.get(b.id) || 0) - (freqMap.get(a.id) || 0));
    }
    case 'recent': {
      const recent = await getRecentFoods(100);
      const recentIds = new Set(recent.map(f => f.id));
      // Simple boolean sort: was it recently logged?
      return [...foods].sort((a, b) => {
        const aRecent = recentIds.has(a.id) ? 1 : 0;
        const bRecent = recentIds.has(b.id) ? 1 : 0;
        return bRecent - aRecent;
      });
    }
    case 'best':
    default:
      // Keep original tiered order (matchTier + length)
      return foods;
  }
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
    const words = trimmed.split(/\s+/).filter(Boolean);

    let queryBuilder = supabase
      // TODO: Change to 'branded_foods' when branded data is loaded
      .from('foods')
      .select('id, name, brand, calories, protein, carbs, fat, serving_units');

    // Each word must appear in name OR brand (chained .or() = AND between words)
    for (const word of words) {
      queryBuilder = queryBuilder.or(`name.ilike.%${word}%,brand.ilike.%${word}%`);
    }

    queryBuilder = queryBuilder.limit(BRANDED_LIMIT);

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
      // TODO: Change to 'branded_foods' when branded data is loaded
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
  // TODO: Verify if this should also change if 'foods' table is renamed
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

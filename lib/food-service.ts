import { 
  searchFoods, 
  searchFoodsByTokens, 
  searchFoodsBySingleToken,
  cacheRemoteFood,
  getFoodByBarcode,
  getFrequentFoods,
  getRecentFoods
} from '@/lib/database';
import { 
  searchUSDAFoods, 
  searchUSDAFoodsByTokens, 
  searchUSDAFoodsBySingleToken 
} from '@/lib/foods-db';
import { supabase } from '@/lib/supabase';
import { fetchOffProduct, normalizeBarcode } from '@/lib/open-food-facts';
import type { Food } from '@/lib/types';
import { normalizeNutrients } from '@/lib/nutrients';

const MIN_BRANDED_QUERY_LENGTH = 3;
const BRANDED_LIMIT = 20;
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
 * Calls the ranked `search_foods` RPC. Only full profiles are cached.
 */
export async function searchBranded(
  query: string,
  excludeIds: string[] = []
): Promise<Food[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_BRANDED_QUERY_LENGTH) return [];

  try {
    const { data, error } = await supabase.rpc('search_foods', {
      q: trimmed,
      exclude_ids: excludeIds,
      max_results: BRANDED_LIMIT,
    });

    if (error || !data) return [];

    // Search rows omit nutrients. Keep their provenance separate from completeness,
    // and cache only full rows so this runtime marker cannot be lost in storage.
    return (data as Food[]).map((food) => ({
      ...food,
      source: food.source || 'open_food_facts',
      detailsPending: true,
    }));
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

    const fullFood: Food = {
      ...(data as Food),
      detailsPending: false,
      ...normalizeNutrients(data),
      source: data.source || 'branded',
      updated_at: data.updated_at || new Date().toISOString(),
    };

    // Cache the complete row, including micronutrients
    await cacheRemoteFood(fullFood);

    return fullFood;
  } catch {
    return null; // Silent failure
  }
}

export type BarcodeLookupResult =
  | { status: 'found'; food: Food }
  | { status: 'invalid' }
  | { status: 'not_found'; code: string }
  | { status: 'incomplete'; code: string; name: string | null; brand: string | null }
  | { status: 'error'; code: string };

/**
 * Resolve a scanned or typed barcode: local database first, then Open Food Facts.
 * Found products are cached locally; not-found and errors are never cached. Never throws.
 */
export async function lookupBarcode(raw: string): Promise<BarcodeLookupResult> {
  const code = normalizeBarcode(raw);
  if (!code) return { status: 'invalid' };
  try {
    const local = await getFoodByBarcode(code);
    if (local) return { status: 'found', food: local };
  } catch {
    // fall through to the network lookup
  }
  const result = await fetchOffProduct(code);
  if (result.status === 'found') {
    try {
      await cacheRemoteFood(result.food);
    } catch {
      return { status: 'error', code };
    }
    return { status: 'found', food: result.food };
  }
  if (result.status === 'incomplete') {
    return { status: 'incomplete', code, name: result.name, brand: result.brand };
  }
  return { status: result.status, code };
}

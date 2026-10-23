import { getFoodSearchMetadata, getFoodsByIds, cacheRemoteFood, getFoodByBarcode, getFrequentFoods, getRecentFoods } from '@/lib/database';
import { getUSDASearchMetadata, getUSDAFoodsByIds } from '@/lib/foods-db';
import { normalizeSearchText, queryTokens, rankFoods, scoreFood } from '@/lib/food-search-relevance';
import { supabase } from '@/lib/supabase';
import { fetchOffProduct, normalizeBarcode } from '@/lib/open-food-facts';
import type { Food } from '@/lib/types';
import { normalizeNutrients } from '@/lib/nutrients';

const MIN_BRANDED_QUERY_LENGTH = 3;
const BRANDED_LIMIT = 20;
const AUTO_FETCH_THRESHOLD = 8;

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

  const finalTokens = queryTokens(text);

  return {
    term: text,
    tokens: raw.length > 200 ? [] : finalTokens,
    quantity,
    unit
  };
}

/**
 * Simple trigram similarity (0 to 1) for client-side fuzzy matching.
 */
export function trigramSimilarity(a: string, b: string): number {
  const trigrams = (text: string) => {
    const normalized = `  ${normalizeSearchText(text)}  `;
    return new Set(Array.from({ length: Math.max(0, normalized.length - 2) }, (_, i) => normalized.slice(i, i + 3)));
  };
  a = normalizeSearchText(a); b = normalizeSearchText(b);
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const left = trigrams(a), right = trigrams(b);
  return 2 * [...left].filter(token => right.has(token)).length / (left.size + right.size);
}

/** Score all name metadata before hydrating the accepted IDs in two batches. */
export async function searchLocal(query: string): Promise<Food[]> {
  const { tokens } = parseQuery(query);
  if (!tokens.length) return [];
  const [local, usda, frequent, recent] = await Promise.all([
    getFoodSearchMetadata(), getUSDASearchMetadata().catch(() => []), getFrequentFoods(100), getRecentFoods(100),
  ]);
  const history = new Map<string, number>();
  frequent.forEach(food => history.set(food.id, 1));
  recent.forEach(food => history.set(food.id, (history.get(food.id) || 0) + 1));
  const localIds = new Set(local.map(food => food.id));
  const winners = rankFoods([...local, ...usda.filter(food => !localIds.has(food.id))], tokens, history).slice(0, 100);
  const [userRows, usdaRows] = await Promise.all([
    getFoodsByIds(winners.filter(food => localIds.has(food.id)).map(food => food.id)),
    getUSDAFoodsByIds(winners.filter(food => !localIds.has(food.id)).map(food => food.id)),
  ]);
  const rows = new Map([...usdaRows, ...userRows].map(food => [food.id, food]));
  return winners.flatMap(food => rows.has(food.id) ? [rows.get(food.id)!] : []);
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
      const freqMap = new Map(frequent.map(f => [f.id, (f as Food & { log_count?: number }).log_count || 0]));
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
      // Keep the shared relevance order.
      return foods;
  }
}

/**
 * Query Supabase for branded foods, excluding any IDs already in local results.
 * Calls the ranked `search_foods` RPC. Partial profiles remain transient.
 */
export async function searchBranded(
  query: string,
  excludeIds: string[] = [],
  options: { signal?: AbortSignal; current?: () => boolean } = {}
): Promise<Food[]> {
  const parsed = parseQuery(query);
  const key = parsed.tokens.join(' ');
  if (key.length < MIN_BRANDED_QUERY_LENGTH) return [];
  const current = () => !options.signal?.aborted && (options.current?.() ?? true);
  let request = supabase.rpc('search_foods', { q: key, max_results: BRANDED_LIMIT });
  if (options.signal) request = request.abortSignal(options.signal);
  const { data, error } = await request;
  if (!current()) throw new Error('Search cancelled');
  if (error || !data) throw error || new Error('Search unavailable');
  const accepted = (data as Food[]).map(food => ({ ...food, source: food.source || 'open_food_facts', detailsPending: true }))
    .filter(food => scoreFood(food, parsed.tokens) !== null);
  return accepted.filter(food => !excludeIds.includes(food.id));
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

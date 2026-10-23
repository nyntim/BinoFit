import { parseQuery, trigramSimilarity, sortFoodResults, shouldAutoFetchBranded } from '@/lib/food-service';
import * as db from '@/lib/database';
import type { Food } from '@/lib/types';

jest.mock('@/lib/database', () => ({
  getFoodSearchMetadata: jest.fn(),
  getFoodsByIds: jest.fn(),
  searchFoods: jest.fn(),
  searchFoodsByTokens: jest.fn(),
  searchFoodsBySingleToken: jest.fn(),
  cacheRemoteFood: jest.fn(),
  getFrequentFoods: jest.fn(),
  getRecentFoods: jest.fn(),
}));
jest.mock('@/lib/foods-db', () => ({
  getUSDASearchMetadata: jest.fn(),
  getUSDAFoodsByIds: jest.fn(),
  searchUSDAFoods: jest.fn(),
  searchUSDAFoodsByTokens: jest.fn(),
  searchUSDAFoodsBySingleToken: jest.fn(),
}));

const food = (id: string, name: string): Food =>
  ({ id, name, brand: null, serving_units: '100g', calories: 0, protein: 0, carbs: 0, fat: 0, source: null, updated_at: '' }) as Food;

describe('parseQuery', () => {
  it('extracts quantity and unit prefix', () => {
    expect(parseQuery('100g chicken breast')).toEqual({
      term: 'chicken breast', tokens: ['chicken', 'breast'], quantity: 100, unit: 'g',
    });
  });
  it('handles decimal quantity with spaced unit', () => {
    const r = parseQuery('1.5 oz cheese');
    expect(r.quantity).toBe(1.5);
    expect(r.unit).toBe('oz');
    expect(r.tokens).toEqual(['cheese']);
  });
  it('supports plural units like cups', () => {
    expect(parseQuery('2 cups rice').unit).toBe('cups');
  });
  it('lowercases and trims input', () => {
    expect(parseQuery('  Greek YOGURT ').tokens).toEqual(['greek', 'yogurt']);
  });
  it('strips filler words', () => {
    expect(parseQuery('bread with butter').tokens).toEqual(['bread', 'butter']);
  });
  it('rejects filler-only queries', () => {
    expect(parseQuery('the of').tokens).toEqual([]);
  });
  it('returns no tokens for an empty query', () => {
    expect(parseQuery('   ').tokens).toEqual([]);
  });
  it('does not treat a bare number as quantity', () => {
    const r = parseQuery('7up');
    expect(r.quantity).toBeUndefined();
    expect(r.tokens).toEqual(['7up']);
  });
});

describe('trigramSimilarity', () => {
  it('is 1 for identical strings', () => expect(trigramSimilarity('apple', 'apple')).toBe(1));
  it('is 0 for strings shorter than 2 chars', () => expect(trigramSimilarity('a', 'apple')).toBe(0));
  it('is 0 for disjoint strings', () => expect(trigramSimilarity('abcd', 'wxyz')).toBe(0));
  it('is higher for near matches than for unrelated strings', () => {
    expect(trigramSimilarity('chicken', 'chiken')).toBeGreaterThan(trigramSimilarity('chicken', 'banana'));
  });
  it('is case insensitive in trigram generation', () => {
    expect(trigramSimilarity('Apple', 'aPPLE')).toBe(1);
  });
});

describe('shouldAutoFetchBranded', () => {
  it('fetches only when local results are sparse (<8)', () => {
    expect(shouldAutoFetchBranded(7)).toBe(true);
    expect(shouldAutoFetchBranded(8)).toBe(false);
  });
});

describe('sortFoodResults', () => {
  const foods = [food('1', 'Banana'), food('2', 'apple'), food('3', 'Cherry')];

  beforeEach(() => jest.clearAllMocks());

  it('sorts A-Z', async () => {
    expect((await sortFoodResults(foods, 'az')).map((f) => f.id)).toEqual(['2', '1', '3']);
  });
  it('sorts Z-A', async () => {
    expect((await sortFoodResults(foods, 'za')).map((f) => f.id)).toEqual(['3', '1', '2']);
  });
  it('does not mutate the input array', async () => {
    const copy = [...foods];
    await sortFoodResults(foods, 'az');
    expect(foods).toEqual(copy);
  });
  it('keeps original order for best', async () => {
    expect(await sortFoodResults(foods, 'best')).toBe(foods);
  });
  it('returns single-item lists untouched without querying the db', async () => {
    const one = [food('1', 'x')];
    expect(await sortFoodResults(one, 'frequent')).toBe(one);
    expect(db.getFrequentFoods).not.toHaveBeenCalled();
  });
  it('sorts by log count descending for frequent', async () => {
    (db.getFrequentFoods as jest.Mock).mockResolvedValue([
      { id: '3', log_count: 9 }, { id: '2', log_count: 2 },
    ]);
    expect((await sortFoodResults(foods, 'frequent')).map((f) => f.id)).toEqual(['3', '2', '1']);
  });
  it('puts recently logged foods first and keeps order otherwise', async () => {
    (db.getRecentFoods as jest.Mock).mockResolvedValue([{ id: '3' }]);
    expect((await sortFoodResults(foods, 'recent')).map((f) => f.id)).toEqual(['3', '1', '2']);
  });
});

describe('branded nutrient profiles', () => {
  const { supabase } = require('@/lib/supabase');
  const { getFullBrandedFood, searchBranded } = require('@/lib/food-service');

  beforeEach(() => {
    jest.clearAllMocks();
    (db.cacheRemoteFood as jest.Mock).mockResolvedValue(undefined);
  });

  it('normalizes the full catalog before returning and caching a complete profile', async () => {
    supabase.single.mockResolvedValueOnce({ data: {
      ...food('full', 'Food'), source: 'branded', added_sugar: 0, b12: 0.00001,
      monounsat_fat: '1.25', selenium: -1, choline: Infinity, folate: '2mg',
    }, error: null });
    const result = await getFullBrandedFood('full');
    expect(result).toMatchObject({ added_sugar: 0, b12: 0.00001, monounsat_fat: 1.25,
      selenium: null, choline: null, folate: null, vitamin_e: null });
    expect(db.cacheRemoteFood).toHaveBeenCalledWith(result);
    expect(supabase.select).toHaveBeenCalledWith('*');
  });

  it('retains provenance, marks summaries pending and caches no incomplete rows', async () => {
    const rows = [{ ...food('partial', 'Partial'), source: 'open_food_facts' }, { ...food('other', 'Partial other'), source: 'usda' }, food('fallback', 'Partial fallback')];
    supabase.rpc.mockResolvedValueOnce({ data: rows, error: null });
    expect(await searchBranded('Partial')).toEqual(rows.map((r) => ({ ...r, source: r.source || 'open_food_facts', detailsPending: true })));
    expect(db.cacheRemoteFood).not.toHaveBeenCalled();
  });

  it('sends normalized tokens and a limit, deduping locally without a growing exclusion payload', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: [food('off:1', 'Oat milk')], error: null });
    expect(await searchBranded('  oat milk ', ['off:1'])).toEqual([]);
    expect(supabase.rpc).toHaveBeenCalledWith('search_foods', { q: 'oat milk', max_results: 20 });
  });

  it('treats punctuation as token separators and gates every returned word', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: [food('1', "Ben & Jerry's (pint)"), food('2', 'Ben')], error: null });
    expect(await searchBranded("ben & jerry's, (pint)")).toHaveLength(1);
    expect(supabase.rpc).toHaveBeenCalledWith('search_foods', expect.objectContaining({ q: 'ben jerry s pint' }));
  });

  it('preserves server tie signals after applying the shared coverage gate', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: [food('popular', 'Oat milk vanilla'), food('shorter', 'Oat milk plain'), food('noise', 'Oats')], error: null });
    expect((await searchBranded('oat milk')).map((row: Food) => row.id)).toEqual(['popular', 'shorter']);
  });

  it('distinguishes errors from successful negative results and cancellation', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(searchBranded('oats')).rejects.toEqual({ message: 'boom' });
    supabase.rpc.mockRejectedValueOnce(new Error('offline'));
    await expect(searchBranded('oats')).rejects.toThrow('offline');
    const signal = new AbortController(); signal.abort();
    const abortSignal = jest.fn().mockResolvedValue({ data: [], error: null });
    supabase.rpc.mockReturnValueOnce({ abortSignal });
    await expect(searchBranded('oats', [], { signal: signal.signal })).rejects.toThrow('cancelled');
    expect(abortSignal).toHaveBeenCalledWith(signal.signal);
    supabase.rpc.mockClear();
    expect(await searchBranded(' ab ')).toEqual([]);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe('metadata search hydration', () => {
  it('scores complete metadata before hydrating only accepted winners', async () => {
    const usda = require('@/lib/foods-db');
    (db.getFoodSearchMetadata as jest.Mock).mockResolvedValue([food('mine', 'Chicken soup')]);
    usda.getUSDASearchMetadata.mockResolvedValue([food('usda', 'Chicken breast'), food('other', 'Chickpea')]);
    (db.getFrequentFoods as jest.Mock).mockResolvedValue([food('mine', 'Chicken soup')]);
    (db.getRecentFoods as jest.Mock).mockResolvedValue([]);
    (db.getFoodsByIds as jest.Mock).mockResolvedValue([]);
    usda.getUSDAFoodsByIds.mockResolvedValue([{ ...food('usda', 'Chicken breast'), iron: 2 }]);
    const { searchLocal } = require('@/lib/food-service');
    expect(await searchLocal('100g chiken breast')).toMatchObject([{ id: 'usda', iron: 2 }]);
    expect(usda.getUSDAFoodsByIds).toHaveBeenCalledWith(['usda']);
    expect(db.getFoodsByIds).toHaveBeenCalledWith([]);
  });
});

import { parseQuery, trigramSimilarity, sortFoodResults, shouldAutoFetchBranded } from '@/lib/food-service';
import * as db from '@/lib/database';
import type { Food } from '@/lib/types';

jest.mock('@/lib/database', () => ({
  searchFoods: jest.fn(),
  searchFoodsByTokens: jest.fn(),
  searchFoodsBySingleToken: jest.fn(),
  cacheRemoteFood: jest.fn(),
  getFrequentFoods: jest.fn(),
  getRecentFoods: jest.fn(),
}));
jest.mock('@/lib/foods-db', () => ({
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
  it('keeps filler tokens when the query is only filler words', () => {
    expect(parseQuery('the of').tokens).toEqual(['the', 'of']);
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

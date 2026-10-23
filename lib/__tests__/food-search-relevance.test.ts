import { normalizeSearchText, queryTokens, rankFoods, scoreFood, strongResultCount, tokenQuality } from '@/lib/food-search-relevance';
const names = ['Peas', 'Green peas', 'Peach', 'Peanut', 'Chickpea', 'Apple', 'Chicken breast', 'Chicken soup', 'Dragonfruit', 'Kombucha', 'Jelly', 'Greek yogurt'];
const foods = names.map(name => ({ id: name, name }));
const search = (q: string) => rankFoods(foods, queryTokens(q)).map(food => food.name);

describe('food word relevance', () => {
  it('ranks peas above final prefixes and rejects mid-word substrings', () => {
    expect(search('pea')).toEqual(['Peas', 'Green peas', 'Peach', 'Peanut']);
    expect(search('green pea')).toEqual(['Green peas']);
  });
  it('requires every token, including the third and later words', () => {
    expect(search('dragonfruit smoothie')).toEqual([]);
    expect(search('dragonfruit kombucha jelly')).toEqual([]);
    expect(search('qwzxv')).toEqual([]);
  });
  it('supports one long-token typo and preserves later-word coverage', () => {
    expect(search('chiken breast')).toEqual(['Chicken breast']);
    expect(search('chikn breast')).toEqual([]);
    expect(search('greek yog')).toEqual(['Greek yogurt']);
    expect(search('gre yog')).toEqual([]);
  });
  it('does not let history rescue a mismatch or outrank plural quality', () => {
    expect(rankFoods(foods, ['pea'], new Map([['Peanut', 9999], ['Apple', 9999]]))[0].name).toBe('Peas');
    expect(rankFoods(foods, ['missing'], new Map([['Apple', 9999]]))).toEqual([]);
    expect(strongResultCount(foods, ['chiken', 'breast'])).toBe(0);
  });
  it('normalizes accents, punctuation, repeated words and casing', () => {
    expect(normalizeSearchText(' CRÈME, (7up). 2%_plain ')).toBe('creme 7up 2 plain');
    expect(queryTokens("Ben & Jerry's")).toEqual(['ben', 'jerry', 's']);
    expect(queryTokens('Greek greek WITH yogurt')).toEqual(['greek', 'yogurt']);
    expect(scoreFood({ id: 'accent', name: 'Crème brûlée' }, ['creme', 'brulee'])?.exact).toBe(0);
  });
  it('rejects empty, filler-only and over-limit queries rather than dropping meaning', () => {
    expect(queryTokens('the of')).toEqual([]);
    expect(queryTokens('a'.repeat(201))).toEqual([]);
    expect(queryTokens(Array.from({ length: 13 }, (_, i) => `word${i}`).join(' '))).toEqual([]);
  });
  it('limits plural equivalence and typo edits conservatively', () => {
    expect(tokenQuality('pea', 'peas', false)).toBe(1);
    expect(tokenQuality('gas', 'ga', false)).toBeNull();
    expect(tokenQuality('glass', 'glas', false)).toBeNull();
    expect(tokenQuality('citrus', 'citru', false)).toBe(3);
    expect(tokenQuality('chiken', 'chicken', false)).toBe(3);
    expect(tokenQuality('chiken', 'chickens', false)).toBeNull();
  });
  it('breaks identical ties by stable ID', () => {
    expect(rankFoods([{ id: 'b', name: 'Peas' }, { id: 'a', name: 'Peas' }], ['pea']).map(food => food.id)).toEqual(['a', 'b']);
  });
});

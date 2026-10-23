/** Shared word coverage contract for local and remote food search. */
export type FoodMetadata = { id: string; name: string; brand?: string | null; source?: string | null; searchIndex?: { name: string; nameWordCount: number; words: string[] } };
export const MAX_QUERY_LENGTH = 200;
export const MAX_QUERY_TOKENS = 12;
const FILLERS = new Set(['a', 'an', 'the', 'of', 'with', 'and', 'for', 'in', 'on', 'at', 'by', 'to']);

export function normalizeSearchText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

export function queryTokens(text: string): string[] {
  if (text.length > MAX_QUERY_LENGTH) return [];
  const words = normalizeSearchText(text).split(' ').filter(Boolean);
  if (words.length > MAX_QUERY_TOKENS) return [];
  return [...new Set(words.filter(word => !FILLERS.has(word)))];
}

/** At most one insertion, deletion or substitution. Transpositions count twice. */
export function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + Number(i < a.length || j < b.length) <= 1;
}

function singular(word: string): string {
  return word.length >= 4 && word.endsWith('s') && !/(ss|us|is)$/.test(word) ? word.slice(0, -1) : word;
}

// 0 exact, 1 conservative plural, 2 final prefix, 3 long-token typo.
export function tokenQuality(query: string, word: string, final: boolean): number | null {
  if (query === word) return 0;
  if (singular(query) === singular(word)) return 1;
  if (final && word.startsWith(query)) return 2;
  if (query.length >= 6 && word.length >= 5 && oneEditApart(query, word)) return 3;
  return null;
}

/** Pre-tokenize the immutable catalog once without retaining nutrient profiles. */
export function indexFoodMetadata<T extends FoodMetadata>(food: T): T {
  const name = normalizeSearchText(food.name);
  const nameWords = name.split(' ');
  return { ...food, searchIndex: { name, nameWordCount: nameWords.length, words: [...nameWords, ...normalizeSearchText(food.brand || '').split(' ').filter(Boolean)] } };
}

export type Relevance = { exact: number; worst: number; total: number; proximity: number; brand: number; strong: boolean };
export function scoreFood(food: FoodMetadata, tokens: readonly string[]): Relevance | null {
  if (!tokens.length) return null;
  const { name, nameWordCount, words } = food.searchIndex || indexFoodMetadata(food).searchIndex!;
  const matches: { quality: number; index: number }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    let best: { quality: number; index: number } | undefined;
    words.forEach((word, index) => {
      const quality = tokenQuality(tokens[i], word, i === tokens.length - 1);
      if (quality !== null && (!best || quality < best.quality)) best = { quality, index };
    });
    if (!best) return null;
    matches.push(best);
  }
  const worst = Math.max(...matches.map(match => match.quality));
  return {
    exact: Number(name !== tokens.join(' ')), worst,
    total: matches.reduce((sum, match) => sum + match.quality, 0),
    proximity: matches.slice(1).reduce((sum, match, i) => sum + Math.abs(match.index - matches[i].index - 1), 0),
    brand: matches.filter(match => match.index >= nameWordCount).length,
    strong: worst < 3,
  };
}

export function rankFoods<T extends FoodMetadata>(foods: readonly T[], tokens: readonly string[], history: ReadonlyMap<string, number> = new Map()): T[] {
  return foods.map(food => ({ food, score: scoreFood(food, tokens) }))
    .filter((row): row is { food: T; score: Relevance } => row.score !== null)
    .sort((a, b) => a.score.exact - b.score.exact || a.score.worst - b.score.worst || a.score.total - b.score.total ||
      a.score.proximity - b.score.proximity || a.score.brand - b.score.brand ||
      Math.min(2, history.get(b.food.id) || 0) - Math.min(2, history.get(a.food.id) || 0) ||
      sourcePreference(a.food.source) - sourcePreference(b.food.source) || a.food.name.length - b.food.name.length || a.food.id.localeCompare(b.food.id))
    .map(row => row.food);
}
function sourcePreference(source?: string | null): number {
  return source === 'custom' ? 0 : source?.startsWith('usda') ? 1 : 2;
}
export function strongResultCount(foods: readonly FoodMetadata[], tokens: readonly string[]): number {
  return foods.filter(food => scoreFood(food, tokens)?.strong).length;
}

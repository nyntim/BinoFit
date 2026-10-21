/** Short, user-facing label for where a food came from. Null hides the tag (never prints a raw id). */
export function foodSourceLabel(source: string | null | undefined): string | null {
  if (!source) return null;
  if (source.startsWith('usda')) return 'USDA';
  if (source === 'branded') return 'Branded';
  if (source === 'open_food_facts') return 'Open Food Facts';
  if (source === 'custom') return 'Custom';
  return null;
}

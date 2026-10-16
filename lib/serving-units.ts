/**
 * Base weight in grams of one serving, parsed from a serving_units string such as
 * "1 cup (240 g)", "100g" or "2 oz". Returns null when no weight is present.
 * Word boundaries stop words like "1 glass" or "1 granola bar" from reading as "1 g".
 */
export function parseBaseGrams(servingUnits: string): number | null {
  const gramMatch = servingUnits.match(/(\d+(?:\.\d+)?)\s*g(?:rams?)?\b/i);
  if (gramMatch) return parseFloat(gramMatch[1]);
  const ozMatch = servingUnits.match(/(\d+(?:\.\d+)?)\s*oz\b/i);
  if (ozMatch) return Math.round(parseFloat(ozMatch[1]) * 28.35 * 10) / 10;
  return null;
}

/** Canonical per-base-serving nutrients. Unknown values remain null; no daily targets. */
const CATALOG = [
  { id: 'fiber', label: 'Fiber', unit: 'g', group: 'extended_macros', macroParent: 'carbs' },
  { id: 'sugar', label: 'Sugar', unit: 'g', group: 'extended_macros', macroParent: 'carbs' },
  { id: 'added_sugar', label: 'Added sugar', unit: 'g', group: 'extended_macros', macroParent: 'carbs' },
  { id: 'saturated_fat', label: 'Saturated fat', unit: 'g', group: 'extended_macros', macroParent: 'fat' },
  { id: 'trans_fat', label: 'Trans fat', unit: 'g', group: 'extended_macros', macroParent: 'fat' },
  { id: 'monounsat_fat', label: 'Monounsaturated fat', unit: 'g', group: 'extended_macros', macroParent: 'fat' },
  { id: 'polyunsat_fat', label: 'Polyunsaturated fat', unit: 'g', group: 'extended_macros', macroParent: 'fat' },
  { id: 'cholesterol', label: 'Cholesterol', unit: 'mg', group: 'extended_macros', macroParent: 'fat' },
  { id: 'sodium', label: 'Sodium', unit: 'mg', group: 'minerals' },
  { id: 'potassium', label: 'Potassium', unit: 'mg', group: 'minerals' },
  { id: 'calcium', label: 'Calcium', unit: 'mg', group: 'minerals' },
  { id: 'iron', label: 'Iron', unit: 'mg', group: 'minerals' },
  { id: 'magnesium', label: 'Magnesium', unit: 'mg', group: 'minerals' },
  { id: 'zinc', label: 'Zinc', unit: 'mg', group: 'minerals' },
  { id: 'phosphorus', label: 'Phosphorus', unit: 'mg', group: 'minerals' },
  { id: 'copper', label: 'Copper', unit: 'mg', group: 'minerals' },
  { id: 'manganese', label: 'Manganese', unit: 'mg', group: 'minerals' },
  { id: 'selenium', label: 'Selenium', unit: 'ug', group: 'minerals' },
  { id: 'vitamin_a', label: 'Vitamin A (RAE)', unit: 'ug', group: 'vitamins' },
  { id: 'vitamin_c', label: 'Vitamin C', unit: 'mg', group: 'vitamins' },
  { id: 'vitamin_d', label: 'Vitamin D', unit: 'ug', group: 'vitamins' },
  { id: 'vitamin_e', label: 'Vitamin E (alpha-tocopherol)', unit: 'mg', group: 'vitamins' },
  { id: 'vitamin_k', label: 'Vitamin K', unit: 'ug', group: 'vitamins' },
  { id: 'thiamin', label: 'Thiamin (B1)', unit: 'mg', group: 'vitamins' },
  { id: 'riboflavin', label: 'Riboflavin (B2)', unit: 'mg', group: 'vitamins' },
  { id: 'niacin', label: 'Niacin (B3)', unit: 'mg', group: 'vitamins' },
  { id: 'b6', label: 'Vitamin B6', unit: 'mg', group: 'vitamins' },
  { id: 'folate', label: 'Folate (total)', unit: 'ug', group: 'vitamins' },
  { id: 'b12', label: 'Vitamin B12', unit: 'ug', group: 'vitamins' },
  { id: 'choline', label: 'Choline', unit: 'mg', group: 'vitamins' },
] as const;
export type NutrientId = typeof CATALOG[number]['id'];
export type NutrientDefinition = {
  id: NutrientId; label: string; unit: 'g' | 'mg' | 'ug';
  group: 'extended_macros' | 'minerals' | 'vitamins'; macroParent?: 'carbs' | 'fat';
};
export const NUTRIENTS: readonly NutrientDefinition[] = CATALOG;
export type NutrientValues = Record<NutrientId, number | null>;
export const NUTRIENT_IDS: readonly NutrientId[] = NUTRIENTS.map((n) => n.id);

export function normalizeNutrients(input: unknown): NutrientValues {
  const row = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return Object.fromEntries(NUTRIENT_IDS.map((id) => {
    const raw = row[id];
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+(?:\.\d+)?$/.test(raw.trim()) ? Number(raw) : NaN;
    return [id, Number.isFinite(value) && value >= 0 ? value : null];
  })) as NutrientValues;
}

export function scaleNutrients(input: unknown, multiplier: number): NutrientValues {
  const values = normalizeNutrients(input);
  return Object.fromEntries(NUTRIENT_IDS.map((id) => {
    const v = values[id];
    const scaled = v == null ? NaN : v * multiplier;
    return [id, Number.isFinite(multiplier) && multiplier >= 0 && Number.isFinite(scaled) ? scaled : null];
  })) as NutrientValues;
}

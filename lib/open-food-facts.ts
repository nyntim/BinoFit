import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { Food } from '@/lib/types';
import { NUTRIENTS, normalizeNutrients, type NutrientId } from '@/lib/nutrients';

const OFF_BASE_URL = 'https://world.openfoodfacts.org/api/v2/product';
const OFF_FIELDS =
  'code,product_name,product_name_en,generic_name,brands,serving_size,serving_quantity,serving_quantity_unit,nutriments';
const OFF_CONTACT = 'tin025@ucsd.edu';
const OFF_TIMEOUT_MS = 8000;
const KJ_PER_KCAL = 4.184;
const MAX_SERVING = 2000;

export type OffResult =
  | { status: 'found'; food: Food }
  | { status: 'not_found' }
  | { status: 'incomplete'; name: string | null; brand: string | null }
  | { status: 'error' };

// ---------- Barcode normalization ----------

function hasValidCheckDigit(digits: string): boolean {
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    // Weights alternate 3,1 starting from the digit next to the check digit
    const weight = (body.length - i) % 2 === 1 ? 3 : 1;
    sum += Number(body[i]) * weight;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/** Expand an 8-digit UPC-E (number system 0 or 1) to its 12-digit UPC-A form. */
function expandUpcE(code: string): string | null {
  const ns = code[0];
  if (ns !== '0' && ns !== '1') return null;
  const [a, b, c, d, e, f] = code.slice(1, 7).split('');
  const check = code[7];
  let body: string;
  if (f === '0' || f === '1' || f === '2') body = `${a}${b}${f}0000${c}${d}${e}`;
  else if (f === '3') body = `${a}${b}${c}00000${d}${e}`;
  else if (f === '4') body = `${a}${b}${c}${d}00000${e}`;
  else body = `${a}${b}${c}${d}${e}0000${f}`;
  return `${ns}${body}${check}`;
}

/**
 * Digits-only GTIN with a valid check digit, or null. 12-digit UPC-A is padded to
 * EAN-13; 8-digit UPC-E is expanded to UPC-A first when it is not a valid EAN-8.
 */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(digits.length)) return null;
  if (hasValidCheckDigit(digits)) return digits.length === 12 ? `0${digits}` : digits;
  if (digits.length === 8) {
    const upcA = expandUpcE(digits);
    if (upcA && hasValidCheckDigit(upcA)) return `0${upcA}`;
  }
  return null;
}

// ---------- Mapping ----------

type Nutriments = Record<string, unknown>;

type OffProduct = {
  product_name?: unknown;
  product_name_en?: unknown;
  generic_name?: unknown;
  brands?: unknown;
  serving_size?: unknown;
  serving_quantity?: unknown;
  serving_quantity_unit?: unknown;
  nutriments?: unknown;
};

/** Numbers and numeric strings only; NaN, negative and anything else count as missing. */
function toNum(v: unknown): number | null {
  const n = typeof v === 'string' ? (v.trim() ? Number(v.replace(',', '.')) : NaN) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function toText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

const round0 = (v: number) => Math.round(v);
const round1 = (v: number) => Math.round(v * 10) / 10;

const MEASURE_RE = /\d+(?:[.,]\d+)?\s*(?:grams?|g|milliliters?|ml|cl|l|fl\.?\s*oz|oz)\b/gi;

// Keep these ordered substitutions in sync with the catalog mapper and shared fixtures.
const LABEL_FIXES: Array<[RegExp, string]> = [
  [/\[[^\]]*\]?/g, ' '],
  [/â‰ˆ|≈|~/g, ' about '],
  [/â€\S?|Â/g, ' '],
  [/\bONZA?\b/gi, 'oz'],
  [/\bOZA\b/gi, 'fl oz'],
  [/\bf\s+oz\b/gi, 'fl oz'],
  [/\bPKG\b\.?/gi, 'package'],
  [/\bEA\b/gi, 'each'],
  [/\bCONT\b\.?/gi, 'container'],
  [/[#|"=]/g, ' '],
];

export function cleanServingSize(servingSize: string): string {
  for (const [pattern, replacement] of LABEL_FIXES) {
    servingSize = servingSize.replace(pattern, replacement);
  }
  return servingSize.toLowerCase();
}

/**
 * Serving description in the form serving-picker understands. `quantity` is grams or ml
 * per serving; null means no usable serving info, so values stay per 100g.
 */
export function buildServingUnits(
  servingSize: string | null,
  quantity: number | null,
  unit: 'g' | 'ml'
): string {
  if (quantity == null || quantity <= 0) return '100g';
  const q = `${round1(quantity)}${unit}`;
  const label = cleanServingSize(servingSize ?? '')
    .replace(/\([^)]*\)?/g, ' ')
    .replace(MEASURE_RE, (measure) => /fl\.?\s*oz/i.test(measure) ? 'fl oz' : ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:/.)-]+|[\s,;:/(-]+$/g, '');
  return label ? `${label} (${q})` : q;
}

/** Map an Open Food Facts product to a Food (or `incomplete` when name or energy is missing). */
export function mapOffProduct(
  product: OffProduct,
  code: string,
  now: string = new Date().toISOString()
): OffResult {
  const nutriments: Nutriments =
    product.nutriments && typeof product.nutriments === 'object' ? (product.nutriments as Nutriments) : {};

  const name = toText(product.product_name_en) ?? toText(product.product_name) ?? toText(product.generic_name);
  const brandsText = toText(product.brands);
  const brand = brandsText ? brandsText.split(',')[0].trim() || null : null;

  const servingSize = toText(product.serving_size);
  const rawQty = toNum(product.serving_quantity);
  const rawUnit = toText(product.serving_quantity_unit)?.toLowerCase() ?? (/ml\b/i.test(servingSize ?? '') ? 'ml' : 'g');
  const unit: 'g' | 'ml' | null = rawUnit === 'g' ? 'g' : rawUnit === 'ml' ? 'ml' : null;
  const quantity = rawQty != null && rawQty > 0 && rawQty <= MAX_SERVING && unit ? rawQty : null;

  // Start from the _100g value scaled to one serving; use _serving only when _100g is missing.
  // `bases` are alternative keys with a divisor (kJ to kcal).
  const scaled = (bases: Array<[string, number]>): number | null => {
    for (const [base, divisor] of bases) {
      const per100 = toNum(nutriments[`${base}_100g`]);
      if (per100 != null) return (quantity != null ? (per100 * quantity) / 100 : per100) / divisor;
    }
    if (quantity != null) {
      for (const [base, divisor] of bases) {
        const perServing = toNum(nutriments[`${base}_serving`]);
        if (perServing != null) return perServing / divisor;
      }
    }
    return null;
  };

  const energy = scaled([
    ['energy-kcal', 1],
    ['energy-kj', KJ_PER_KCAL],
    ['energy', KJ_PER_KCAL],
  ]);

  if (!name || energy == null) return { status: 'incomplete', name, brand };

  const macro = (base: string) => round1(scaled([[base, 1]]) ?? 0);
  // OFF normalized _100g/_serving mass fields are always grams, regardless of _unit.
  // https://openfoodfacts.github.io/documentation/docs/Product-Opener/schemas/schemas/product_nutrition/
  // Taxonomy IDs: https://github.com/openfoodfacts/openfoodfacts-server/blob/main/taxonomies/nutrients.txt
  const aliases: Partial<Record<NutrientId, string>> = {
    fiber: 'fiber', sugar: 'sugars', added_sugar: 'added-sugars',
    saturated_fat: 'saturated-fat', trans_fat: 'trans-fat',
    monounsat_fat: 'monounsaturated-fat', polyunsat_fat: 'polyunsaturated-fat',
    cholesterol: 'cholesterol', sodium: 'sodium', potassium: 'potassium',
    calcium: 'calcium', iron: 'iron', magnesium: 'magnesium', zinc: 'zinc',
    phosphorus: 'phosphorus', copper: 'copper', manganese: 'manganese', selenium: 'selenium',
    vitamin_c: 'vitamin-c', vitamin_d: 'vitamin-d', vitamin_k: 'vitamin-k',
    thiamin: 'vitamin-b1', riboflavin: 'vitamin-b2', niacin: 'vitamin-pp',
    b6: 'vitamin-b6', folate: 'folates', b12: 'vitamin-b12', choline: 'choline',
  };
  // Generic vitamin-a does not establish RAE; generic vitamin-e does not establish
  // alpha-tocopherol. Keep both unknown. vitamin-b9 is folic acid, not total folate;
  // only the explicit total-folates taxonomy ID maps to our folate definition.
  const nutrients = normalizeNutrients(Object.fromEntries(NUTRIENTS.map(({ id, unit }) => {
    const alias = aliases[id];
    const value = alias ? scaled([[alias, 1]]) : null;
    const factor = unit === 'mg' ? 1000 : unit === 'ug' ? 1e6 : 1;
    return [id, value == null ? null : value * factor];
  })));
  if (nutrients.sodium == null) {
    const salt = scaled([['salt', 1]]);
    nutrients.sodium = normalizeNutrients({ sodium: salt == null ? null : salt * 400 }).sodium;
  }

  const food: Food = {
    id: `off:${code}`,
    name,
    brand,
    serving_units: buildServingUnits(servingSize, quantity, unit ?? 'g'),
    calories: round0(energy),
    protein: macro('proteins'),
    carbs: macro('carbohydrates'),
    fat: macro('fat'),
    source: 'open_food_facts',
    updated_at: now,
    barcode: code,
    ...nutrients,
  };
  return { status: 'found', food };
}

// ---------- Network ----------

/** Look up a normalized barcode on Open Food Facts. Never throws; errors are not cached by callers. */
export async function fetchOffProduct(code: string): Promise<OffResult> {
  const version = Constants.expoConfig?.version ?? '0';
  const url =
    `${OFF_BASE_URL}/${encodeURIComponent(code)}?fields=${OFF_FIELDS}` +
    `&app_name=BinoFit&app_version=${encodeURIComponent(version)}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  // Browsers forbid setting User-Agent
  if (Platform.OS !== 'web') headers['User-Agent'] = `BinoFit/${version} (${OFF_CONTACT})`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (res.status === 404) return { status: 'not_found' };
    if (!res.ok) return { status: 'error' };
    const json = (await res.json()) as { status?: number; product?: OffProduct };
    if (json.status === 0 || !json.product) return { status: 'not_found' };
    return mapOffProduct(json.product, code);
  } catch {
    return { status: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

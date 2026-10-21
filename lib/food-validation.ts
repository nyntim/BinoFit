export type BlankPolicy = 'required' | 'zero' | 'null';
export type DecimalResult = { valid: true; value: number | null; error: null } | { valid: false; value: null; error: string };

/** Parse the entire unsigned decimal. Blank policy is explicit for optional nutrients. */
export function parseFoodDecimal(raw: string, blank: BlankPolicy): DecimalResult {
  const text = raw.trim();
  if (!text) {
    if (blank === 'required') return { valid: false, value: null, error: 'Enter a number.' };
    return { valid: true, value: blank === 'zero' ? 0 : null, error: null };
  }
  if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) {
    return { valid: false, value: null, error: 'Enter a valid nonnegative number.' };
  }
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value)
    ? { valid: true, value, error: null }
    : { valid: false, value: null, error: 'Enter a finite number.' };
}

export function validateNutrient(raw: string, label: string, blank: BlankPolicy): DecimalResult {
  const result = parseFoodDecimal(raw, blank);
  return result.valid ? result : { ...result, error: raw.trim() ? `${label}: enter a finite number of 0 or more.` : `Enter ${label.toLowerCase()}.` };
}

export type ServingUnit = 'default' | 'grams' | 'oz';
export const GRAMS_PER_OUNCE = 28.35;
export function validBaseGrams(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}
export function servingMultiplier(amount: number, unit: ServingUnit, baseGrams: number | null): number {
  if (!validBaseGrams(baseGrams)) return amount;
  return unit === 'grams' ? amount / baseGrams : unit === 'oz' ? amount * GRAMS_PER_OUNCE / baseGrams : amount;
}

export type ServingValidation = { valid: boolean; amount: number | null; multiplier: number | null; error: string | null };
export function validateServing(raw: string, unit: ServingUnit, baseGrams: number | null): ServingValidation {
  const parsed = parseFoodDecimal(raw, 'required');
  const fail = (error: string): ServingValidation => ({ valid: false, amount: parsed.value, multiplier: null, error });
  if (!parsed.valid || parsed.value === null) return fail(parsed.error ?? 'Enter an amount.');
  const weighted = validBaseGrams(baseGrams);
  if (!weighted && unit !== 'default') return fail('Choose default servings for this food.');
  const label = unit === 'grams' ? 'grams' : unit === 'oz' ? 'ounces' : 'servings';
  if (parsed.value < 0.01) return fail(`Enter at least 0.01 ${label}.`);
  const multiplier = servingMultiplier(parsed.value, unit, baseGrams);
  const max = weighted ? 10000 / (unit === 'grams' ? 1 : unit === 'oz' ? GRAMS_PER_OUNCE : baseGrams) : 100;
  // Allow only machine-rounding drift at the canonical 10,000 g boundary.
  const tolerance = weighted ? 10000 * Number.EPSILON * 8 : 0;
  const canonical = weighted ? (unit === 'grams' ? parsed.value : unit === 'oz' ? parsed.value * GRAMS_PER_OUNCE : parsed.value * baseGrams) : parsed.value;
  if (!Number.isFinite(multiplier) || canonical > (weighted ? 10000 : 100) + tolerance) {
    return fail(`Use ${max.toLocaleString('en-US', { maximumFractionDigits: 8 })} ${label} or less.`);
  }
  return { valid: true, amount: parsed.value, multiplier, error: null };
}

/** Expand exponent notation so internally converted values obey the decimal input contract. */
export function formatServingAmount(value: number): string {
  const text = String(value);
  if (!text.includes('e')) return text;
  const [coefficient, exponentText] = text.split('e');
  const exponent = Number(exponentText);
  const [whole, fraction = ''] = coefficient.split('.');
  const digits = whole + fraction;
  const point = whole.length + exponent;
  if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return digits + '0'.repeat(point - digits.length);
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

/**
 * Re-expresses an amount when the unit changes (the serving picker's unit switch).
 * Returns null when nothing should change: the input is invalid, the food has no usable
 * base grams, or the unit is the same. The caller keeps the typed text and just swaps the unit.
 */
export function convertServingAmount(raw: string, from: ServingUnit, to: ServingUnit, baseGrams: number | null): string | null {
  if (from === to || !validBaseGrams(baseGrams)) return null;
  if (!validateServing(raw, from, baseGrams).valid) return null;
  const parsed = parseFoodDecimal(raw, 'required');
  if (!parsed.valid || parsed.value === null) return null;
  const canonical = servingMultiplier(parsed.value, from, baseGrams);
  const amount = to === 'default' ? canonical : to === 'grams' ? canonical * baseGrams : canonical * baseGrams / GRAMS_PER_OUNCE;
  return Number.isFinite(amount) ? formatServingAmount(amount) : null;
}

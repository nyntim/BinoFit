import { parseBaseGrams } from '@/lib/serving-units';
import { normalizeBarcode, mapOffProduct, buildServingUnits, cleanServingSize } from '@/lib/open-food-facts';

import parityFixtures from '@/test-utils/fixtures/off-serving-parity.json';

const NOW = '2026-01-01T00:00:00.000Z';
const map = (p: any, code = '0036000291452') => mapOffProduct(p, code, NOW);
const foodOf = (p: any) => {
  const r = map(p);
  if (r.status !== 'found') throw new Error(`expected found, got ${r.status}`);
  return r.food;
};

describe('normalizeBarcode', () => {
  it('pads a valid 12-digit UPC-A to EAN-13', () => {
    expect(normalizeBarcode('036000291452')).toBe('0036000291452');
  });
  it('keeps a valid EAN-13 unchanged', () => {
    expect(normalizeBarcode('4006381333931')).toBe('4006381333931');
  });
  it('accepts a valid EAN-8 and GTIN-14', () => {
    expect(normalizeBarcode('96385074')).toBe('96385074');
    expect(normalizeBarcode('10036000291459')).toBe('10036000291459');
  });
  it('strips non-digit characters', () => {
    expect(normalizeBarcode(' 0 36000-291452\n')).toBe('0036000291452');
  });
  it('rejects a wrong check digit', () => {
    expect(normalizeBarcode('036000291453')).toBeNull();
    expect(normalizeBarcode('4006381333932')).toBeNull();
  });
  it.each(['', 'abc', '1234567', '123456789', '12345678901', '123456789012345'])(
    'rejects bad length or non-numeric input %p',
    (raw) => {
      expect(normalizeBarcode(raw)).toBeNull();
    }
  );
  it('expands a UPC-E code that is not a valid EAN-8 to EAN-13', () => {
    expect(normalizeBarcode('01234543')).toBe('0012340000053');
    expect(normalizeBarcode('01234036')).toBe('0012300000406');
    expect(normalizeBarcode('01234125')).toBe('0012200003415');
    expect(normalizeBarcode('01234301')).toBe('0012000003431');
  });
  it('treats an 8-digit code valid as EAN-8 as EAN-8, not UPC-E', () => {
    expect(normalizeBarcode('01234565')).toBe('01234565');
  });
  it('rejects an 8-digit code invalid as both EAN-8 and UPC-E', () => {
    expect(normalizeBarcode('01234540')).toBeNull();
    expect(normalizeBarcode('91234543')).toBeNull();
  });
});

describe('mapOffProduct energy', () => {
  const base = { product_name: 'Thing' };
  it('prefers energy-kcal_100g', () => {
    const f = foodOf({ ...base, nutriments: { 'energy-kcal_100g': 250, 'energy-kj_100g': 9999, energy_100g: 9999 } });
    expect(f.calories).toBe(250);
  });
  it('falls back to energy-kj_100g / 4.184', () => {
    expect(foodOf({ ...base, nutriments: { 'energy-kj_100g': 1000 } }).calories).toBe(239);
  });
  it('falls back to energy_100g (kJ) / 4.184', () => {
    expect(foodOf({ ...base, nutriments: { energy_100g: 1000 } }).calories).toBe(239);
  });
  it('is incomplete with no energy, keeping name and brand', () => {
    expect(map({ product_name: 'Thing', brands: 'Acme, Other', nutriments: { proteins_100g: 3 } })).toEqual({
      status: 'incomplete', name: 'Thing', brand: 'Acme',
    });
  });
  it('is incomplete when nutriments is missing or not an object', () => {
    expect(map({ product_name: 'Thing' }).status).toBe('incomplete');
    expect(map({ product_name: 'Thing', nutriments: 'x' }).status).toBe('incomplete');
  });
  it('treats a zero-calorie product as found', () => {
    expect(foodOf({ ...base, nutriments: { 'energy-kcal_100g': 0 } }).calories).toBe(0);
  });
});

describe('mapOffProduct name and brand', () => {
  const n = { 'energy-kcal_100g': 100 };
  it('prefers product_name_en, then product_name, then generic_name', () => {
    expect(foodOf({ product_name_en: 'EN', product_name: 'P', generic_name: 'G', nutriments: n }).name).toBe('EN');
    expect(foodOf({ product_name_en: ' ', product_name: 'P', generic_name: 'G', nutriments: n }).name).toBe('P');
    expect(foodOf({ generic_name: 'G', nutriments: n }).name).toBe('G');
  });
  it('is incomplete with no name', () => {
    expect(map({ nutriments: n })).toEqual({ status: 'incomplete', name: null, brand: null });
  });
  it('uses the first comma-separated brand, trimmed', () => {
    expect(foodOf({ product_name: 'A', brands: ' Acme Co , Other', nutriments: n }).brand).toBe('Acme Co');
  });
  it('sets id, source, barcode and timestamp', () => {
    const f = foodOf({ product_name: 'A', nutriments: n });
    expect(f).toMatchObject({ id: 'off:0036000291452', source: 'open_food_facts', barcode: '0036000291452', updated_at: NOW });
  });
});

describe('mapOffProduct serving scaling', () => {
  it('scales _100g values by serving_quantity/100 and rounds', () => {
    const f = foodOf({
      product_name: 'Bar', serving_size: '1 bar (40g)', serving_quantity: 40,
      nutriments: { 'energy-kcal_100g': 333, proteins_100g: 12.34, carbohydrates_100g: 55.55, fat_100g: 10 },
    });
    expect(f.serving_units).toBe('1 bar (40g)');
    expect(f.calories).toBe(133); // 133.2
    expect(f.protein).toBe(4.9); // 4.936
    expect(f.carbs).toBe(22.2); // 22.22
    expect(f.fat).toBe(4);
  });
  it('accepts string quantities and values', () => {
    const f = foodOf({
      product_name: 'Bar', serving_quantity: '50',
      nutriments: { 'energy-kcal_100g': '200', proteins_100g: '10' },
    });
    expect(f.calories).toBe(100);
    expect(f.protein).toBe(5);
  });
  it('uses _serving only when _100g is missing', () => {
    const f = foodOf({
      product_name: 'Bar', serving_quantity: 40,
      nutriments: { 'energy-kcal_100g': 100, 'energy-kcal_serving': 999, proteins_serving: 7 },
    });
    expect(f.calories).toBe(40);
    expect(f.protein).toBe(7);
  });
  it('ignores _prepared_ values', () => {
    const f = foodOf({
      product_name: 'Soup',
      nutriments: { 'energy-kcal_prepared_100g': 500, 'energy-kcal_100g': 50, proteins_prepared_100g: 9 },
    });
    expect(f.calories).toBe(50);
    expect(f.protein).toBe(0);
  });
  it('ignores _serving values when there is no serving quantity', () => {
    expect(map({ product_name: 'X', nutriments: { 'energy-kcal_serving': 100 } }).status).toBe('incomplete');
  });
  it('falls back to per-100g with "100g" units when serving info is absent or invalid', () => {
    const none = foodOf({ product_name: 'X', nutriments: { 'energy-kcal_100g': 120 } });
    expect(none.serving_units).toBe('100g');
    expect(none.calories).toBe(120);
    const zero = foodOf({ product_name: 'X', serving_quantity: 0, serving_size: '1 bar', nutriments: { 'energy-kcal_100g': 120 } });
    expect(zero.serving_units).toBe('100g');
    expect(zero.calories).toBe(120);
  });
  it('handles ml servings', () => {
    const f = foodOf({
      product_name: 'Juice', serving_size: '1 glass (250 ml)', serving_quantity: 250, serving_quantity_unit: 'ml',
      nutriments: { 'energy-kcal_100g': 40 },
    });
    expect(f.serving_units).toBe('1 glass (250ml)');
    expect(f.calories).toBe(100);
  });
  it('does not scale when the serving unit is unsupported', () => {
    const f = foodOf({
      product_name: 'X', serving_quantity: 2, serving_quantity_unit: 'oz', nutriments: { 'energy-kcal_100g': 100 },
    });
    expect(f.serving_units).toBe('100g');
    expect(f.calories).toBe(100);
  });
});

describe('buildServingUnits', () => {
  it('builds "{label} ({q}g)" and strips parentheticals and measures from the label', () => {
    expect(buildServingUnits('1 bar (40g)', 40, 'g')).toBe('1 bar (40g)');
    expect(buildServingUnits('2 cookies (30 g)', 30, 'g')).toBe('2 cookies (30g)');
  });
  it('uses just "{q}g" when the label is empty', () => {
    expect(buildServingUnits('30 g', 30, 'g')).toBe('30g');
    expect(buildServingUnits(null, 30, 'g')).toBe('30g');
  });
  it('returns "100g" without a quantity', () => {
    expect(buildServingUnits('1 bar', null, 'g')).toBe('100g');
    expect(buildServingUnits('1 bar', 0, 'g')).toBe('100g');
  });
  it.each([
    ['1 bar', 40, 'g', 40],
    [null, 30, 'g', 30],
    [null, 28.5, 'g', 28.5],
    [null, null, 'g', 100],
  ] as const)('output for (%p, %p) parses with serving-picker parseBaseGrams', (label, q, unit, grams) => {
    expect(parseBaseGrams(buildServingUnits(label, q, unit))).toBe(grams);
  });
  it('mapped no-serving food parses to 100 base grams', () => {
    const f = foodOf({ product_name: 'X', nutriments: { 'energy-kcal_100g': 120 } });
    expect(parseBaseGrams(f.serving_units)).toBe(100);
  });
});

describe('mapOffProduct micronutrients', () => {
  const nut = (extra: Record<string, unknown>) => ({ product_name: 'X', nutriments: { 'energy-kcal_100g': 100, ...extra } });
  it('converts g to mg and vitamin D to micrograms', () => {
    const f = foodOf(nut({
      sodium_100g: 0.5, cholesterol_100g: 0.02, calcium_100g: 0.12, iron_100g: 0.0018, potassium_100g: 0.3,
      'vitamin-d_100g': 0.000005, fiber_100g: 3.1234, sugars_100g: 2, 'saturated-fat_100g': 1.5, 'trans-fat_100g': 0.1,
    }));
    expect(f).toMatchObject({
      sodium: 500, cholesterol: 20, calcium: 120, iron: 1.8, potassium: 300, vitamin_d: 5,
      fiber: 3.1234, sugar: 2, saturated_fat: 1.5, trans_fat: 0.1,
    });
  });
  it('maps extended taxonomy aliases using standardized grams, independent of input units', () => {
    const f = foodOf({ ...nut({
      'added-sugars_100g': 0, 'monounsaturated-fat_100g': 2, 'polyunsaturated-fat_100g': 3,
      magnesium_100g: 0.04, zinc_100g: 0.002, phosphorus_100g: 0.15,
      copper_100g: 0.0001, manganese_100g: 0.0002, selenium_100g: 0.000005,
      'vitamin-c_100g': 0.02, 'vitamin-c_unit': 'mg', 'vitamin-d_100g': 0.00000001,
      'vitamin-d_unit': 'IU', 'vitamin-k_100g': 0.000002,
      'vitamin-b1_100g': 0.0003, 'vitamin-b2_serving': 0.0004,
      'vitamin-pp_100g': 0.0005, 'vitamin-b6_100g': 0.0006,
      folates_100g: 0.000007, 'vitamin-b12_100g': 0.000000001, choline_100g: 0.008,
    }), serving_quantity: 50 });
    const expected = { added_sugar: 0, monounsat_fat: 1, polyunsat_fat: 1.5,
      magnesium: 20, zinc: 1, phosphorus: 75, copper: 0.05, manganese: 0.1, selenium: 2.5,
      vitamin_c: 10, vitamin_d: 0.005, vitamin_k: 1, thiamin: 0.15, riboflavin: 0.4,
      niacin: 0.25, b6: 0.3, folate: 3.5, b12: 0.0005, choline: 4 };
    for (const [id, value] of Object.entries(expected)) {
      expect((f as unknown as Record<string, number>)[id]).toBeCloseTo(value, 12);
    }
  });
  it('does not reinterpret ambiguous vitamin definitions or infer added sugar', () => {
    const f = foodOf(nut({ 'vitamin-a_100g': 0.001, 'vitamin-e_100g': 0.002,
      'vitamin-b9_100g': 0.003, sugars_100g: 5 }));
    expect(f).toMatchObject({ vitamin_a: null, vitamin_e: null, folate: null, added_sugar: null });
  });
  it('rejects partially numeric strings rather than ingesting fabricated amounts', () => {
    expect(foodOf(nut({ fiber_100g: '3mg', sodium_100g: '1x', sugar_100g: '' })))
      .toMatchObject({ fiber: null, sodium: null, sugar: null });
  });
  it('scales micros by serving size', () => {
    const f = foodOf({ ...nut({ sodium_100g: 1 }), serving_quantity: 30 });
    expect(f.sodium).toBe(300);
  });
  it('falls back to salt g x 400 for sodium', () => {
    expect(foodOf(nut({ salt_100g: 1.5 })).sodium).toBe(600);
  });
  it('prefers sodium over salt', () => {
    expect(foodOf(nut({ sodium_100g: 0.1, salt_100g: 1.5 })).sodium).toBe(100);
  });
  it('uses null, not 0, for missing micros and 0 for missing macros', () => {
    const f = foodOf(nut({}));
    for (const k of ['fiber', 'sugar', 'sodium', 'cholesterol', 'saturated_fat', 'trans_fat', 'vitamin_d', 'calcium', 'iron', 'potassium'] as const) {
      expect(f[k]).toBeNull();
    }
    expect([f.protein, f.carbs, f.fat]).toEqual([0, 0, 0]);
  });
  it('keeps an explicit zero micro as 0', () => {
    expect(foodOf(nut({ sodium_100g: 0 })).sodium).toBe(0);
  });
  it('treats NaN, negative and junk values as missing', () => {
    const f = foodOf(nut({ proteins_100g: NaN, carbs_100g: -5, fat_100g: 'abc', sodium_100g: -1, fiber_100g: 'x', salt_100g: null }));
    expect([f.protein, f.carbs, f.fat]).toEqual([0, 0, 0]);
    expect(f.sodium).toBeNull();
    expect(f.fiber).toBeNull();
  });
  it('treats negative energy as missing', () => {
    expect(map({ product_name: 'X', nutriments: { 'energy-kcal_100g': -10 } }).status).toBe('incomplete');
  });
  it('falls through to kJ when kcal is invalid', () => {
    expect(foodOf({ product_name: 'X', nutriments: { 'energy-kcal_100g': 'n/a', 'energy-kj_100g': 418.4 } }).calories).toBe(100);
  });
});

describe('parseBaseGrams', () => {
  it.each([
    ['1 glass (250ml)', null],
    ['1 granola bar (40g)', 40],
    ['1 cup (240 g)', 240],
    ['100g', 100],
    ['2 oz (56g)', 56],
    ['2 oz', 56.7],
    ['1 serving', null],
  ] as const)('%p -> %p', (units, expected) => {
    expect(parseBaseGrams(units)).toBe(expected);
  });
});


describe('shared catalog serving parity', () => {
  it.each(parityFixtures.labels)('$name label cleanup and serving-picker base', (fixture) => {
    expect(cleanServingSize(fixture.serving_size ?? '')).toBe(fixture.normalized_label);
    const units = buildServingUnits(fixture.serving_size, fixture.quantity, fixture.unit as 'g' | 'ml');
    expect(units).toBe(fixture.serving_units);
    expect(parseBaseGrams(units)).toBe(fixture.base_grams);
  });

  it.each(parityFixtures.mapping)('$name mapping', (fixture) => {
    const result = map({
      product_name: 'Fixture', serving_size: fixture.serving_size,
      serving_quantity: fixture.quantity, serving_quantity_unit: fixture.unit,
      nutriments: fixture.nutriments,
    });
    if (fixture.expected == null) {
      expect(result.status).toBe('incomplete');
    } else {
      expect(result.status).toBe('found');
      if (result.status === 'found') expect(result.food).toMatchObject(fixture.expected);
    }
  });

  it.each([NaN, Infinity, -Infinity])('ignores nonfinite serving quantity %p', (quantity) => {
    expect(foodOf({ product_name: 'Fixture', serving_quantity: quantity,
      nutriments: { 'energy-kcal_100g': 100, proteins_serving: 999, sodium_serving: 1 },
    })).toMatchObject({ serving_units: '100g', calories: 100, protein: 0, sodium: null });
  });
});

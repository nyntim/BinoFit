import { parse } from 'csv-parse/sync';
import {
  buildExportRows,
  csvField,
  EXPORT_HEADERS,
  exportFileName,
  rangeDates,
  toCsv,
  type ExportRow,
} from '@/lib/export';
import { logTotals, sumEatenTotals } from '@/lib/nutrition-totals';
import type { FoodLogWithFood, MealDefinition, MealNameEntry } from '@/lib/types';

const def = (id: string, position: number): MealDefinition => ({
  id,
  position,
  calorie_target: null,
  protein_target: null,
  carb_target: null,
  fat_target: null,
  reminder_time: null,
  created_at: 'x',
  updated_at: 'x',
});
const name = (meal_id: string, n: string, effective_from: string): MealNameEntry => ({
  meal_id,
  name: n,
  effective_from,
  updated_at: 'x',
});

const DEFS = [def('b', 0), def('l', 1)];
const NAMES = [name('b', 'Breakfast', '2000-01-01'), name('l', 'Lunch', '2000-01-01')];

let seq = 0;
const mkLog = (over: Partial<FoodLogWithFood> = {}): FoodLogWithFood => ({
  id: `log${seq++}`,
  date: '2026-06-01',
  meal_slot: 'b',
  food_id: 'f',
  serving_amount: 1,
  serving_unit: 'g',
  created_at: `2026-06-01T08:00:${String(seq).padStart(2, '0')}Z`,
  updated_at: 'x',
  food_name: 'Egg',
  food_brand: 'Farm',
  food_calories: 70,
  food_protein: 6,
  food_carbs: 0.5,
  food_fat: 5,
  food_serving_units: '1',
  ...over,
});

const row = (over: Partial<ExportRow> = {}): ExportRow => ({
  date: '2026-06-01',
  meal: 'Breakfast',
  status: 'Eaten',
  food: 'Egg',
  brand: 'Farm',
  servings: 1,
  servingUnit: 'g',
  calories: 70,
  protein: 6,
  carbs: 0.5,
  fat: 5,
  ...over,
});

describe('csvField', () => {
  it('leaves plain values unquoted', () => {
    expect(csvField('Egg')).toBe('Egg');
  });
  it('quotes values containing commas', () => {
    expect(csvField('a,b')).toBe('"a,b"');
  });
  it('doubles embedded quotes and quotes the field', () => {
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
  });
  it('quotes values containing LF and CRLF', () => {
    expect(csvField('a\nb')).toBe('"a\nb"');
    expect(csvField('a\r\nb')).toBe('"a\r\nb"');
  });
  it('keeps accents and emoji untouched', () => {
    expect(csvField('Café')).toBe('Café');
    expect(csvField('Pizza 🍕')).toBe('Pizza 🍕');
  });
  it.each(['=SUM(A1)', '+1', '-1', '@cmd', '\tx'])('prefixes text starting with %j', (v) => {
    expect(csvField(v, true)).toBe(`'${v}`);
  });
  it('does not prefix text that merely contains a formula character', () => {
    expect(csvField('a=b', true)).toBe('a=b');
  });
  it('does not prefix non-text values even if they start with a formula character', () => {
    expect(csvField(-1)).toBe('-1');
    expect(csvField('=x')).toBe('=x');
  });
  it('quotes after prefixing when the value also has a comma', () => {
    expect(csvField('=1,2', true)).toBe('"\'=1,2"');
  });
});

describe('toCsv', () => {
  it('starts with a BOM and the header row', () => {
    const csv = toCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe(EXPORT_HEADERS.join(',') + '\r\n');
  });
  it('uses CRLF after every line including the last', () => {
    const csv = toCsv([row(), row()]);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.replace(/\r\n/g, '').includes('\n')).toBe(false);
    expect(csv.split('\r\n')).toHaveLength(4);
  });
  it('never prefixes numeric columns', () => {
    const csv = toCsv([row({ servings: 0.35, calories: 0, protein: 0, carbs: 0, fat: 0 })]);
    const [, data] = parse(csv, { bom: true });
    expect(data.slice(5)).toEqual(['0.35', 'g', '0', '0', '0', '0']);
    expect(data.slice(5).some((v: string) => v.startsWith("'"))).toBe(false);
  });
  it('round-trips awkward text through csv-parse', () => {
    const tricky = row({
      food: 'Mac, "the" cheese\nline2\r\nline3',
      brand: 'Café 🍕',
      meal: 'Snack',
    });
    const recs: Record<string, string>[] = parse(toCsv([tricky, row({ food: '=EVIL()' })]), {
      bom: true,
      columns: true,
    });
    expect(recs).toHaveLength(2);
    expect(recs[0]['Food']).toBe(tricky.food);
    expect(recs[0]['Brand']).toBe('Café 🍕');
    expect(recs[0]['Calories']).toBe('70');
    expect(recs[0]['Protein (g)']).toBe('6');
    expect(recs[0]['Carbs (g)']).toBe('0.5');
    expect(recs[1]['Food']).toBe("'=EVIL()");
    expect(Object.keys(recs[0])).toEqual([...EXPORT_HEADERS]);
  });
  it('includes the Brand column', () => {
    expect(EXPORT_HEADERS).toContain('Brand');
    const [rec]: Record<string, string>[] = parse(toCsv([row({ brand: 'Acme' })]), { bom: true, columns: true });
    expect(rec['Brand']).toBe('Acme');
  });
});

describe('buildExportRows', () => {
  it('returns no rows for an empty range', () => {
    expect(buildExportRows([], DEFS, NAMES, [])).toEqual([]);
    expect(parse(toCsv([]), { bom: true })).toHaveLength(1);
  });

  it('uses the old meal name before a rename and the new name from the rename date', () => {
    const names = [...NAMES, name('b', 'Brunch', '2026-06-02')];
    const rows = buildExportRows(
      [
        mkLog({ date: '2026-06-01' }),
        mkLog({ date: '2026-06-02' }),
        mkLog({ date: '2026-06-03' }),
      ],
      DEFS,
      names,
      []
    );
    expect(rows.map((r) => r.meal)).toEqual(['Breakfast', 'Brunch', 'Brunch']);
  });

  it('labels logs of a deleted meal as Other', () => {
    const rows = buildExportRows([mkLog({ meal_slot: 'gone' })], DEFS, NAMES, []);
    expect(rows[0].meal).toBe('Other');
  });

  it('marks planned, eaten and unconfirmed slots', () => {
    const logs = [mkLog({ meal_slot: 'b' }), mkLog({ meal_slot: 'l' })];
    const planned = buildExportRows(
      logs,
      DEFS,
      NAMES,
      [{ date: '2026-06-01', meal_slot: 'b', confirmed: false }]
    );
    expect(planned.map((r) => r.status)).toEqual(['Planned', 'Eaten']);
    const eaten = buildExportRows(
      logs,
      DEFS,
      NAMES,
      [{ date: '2026-06-01', meal_slot: 'b', confirmed: true }]
    );
    expect(eaten.map((r) => r.status)).toEqual(['Eaten', 'Eaten']);
  });

  it('does not apply another date confirmation', () => {
    const rows = buildExportRows([mkLog()], DEFS, NAMES, [
      { date: '2026-06-02', meal_slot: 'b', confirmed: false },
    ]);
    expect(rows[0].status).toBe('Eaten');
  });

  it('rounds fractional servings and macros', () => {
    const [r] = buildExportRows(
      [
        mkLog({
          serving_amount: 0.35,
          food_calories: 123,
          food_protein: 7.77,
          food_carbs: 11.11,
          food_fat: 3.33,
        }),
      ],
      DEFS,
      NAMES,
      []
    );
    expect(r.servings).toBe(0.35);
    expect(r.calories).toBe(Math.round(123 * 0.35));
    expect(r.protein).toBe(2.7);
    expect(r.carbs).toBe(3.9);
    expect(r.fat).toBe(1.2);
  });

  it('exports null brand and unit as empty strings', () => {
    const [r] = buildExportRows(
      [mkLog({ food_brand: null, serving_unit: null as any })],
      DEFS,
      NAMES,
      []
    );
    expect(r.brand).toBe('');
    expect(r.servingUnit).toBe('');
  });

  it('sorts by date, then meal position, then created_at', () => {
    const logs = [
      mkLog({ date: '2026-06-02', meal_slot: 'b', food_name: 'D2B' }),
      mkLog({ date: '2026-06-01', meal_slot: 'l', food_name: 'D1L' }),
      mkLog({ date: '2026-06-01', meal_slot: 'b', food_name: 'D1B-late', created_at: '2026-06-01T09:00:00Z' }),
      mkLog({ date: '2026-06-01', meal_slot: 'b', food_name: 'D1B-early', created_at: '2026-06-01T07:00:00Z' }),
    ];
    const rows = buildExportRows(logs, DEFS, NAMES, []);
    expect(rows.map((r) => r.food)).toEqual(['D1B-early', 'D1B-late', 'D1L', 'D2B']);
  });

  it('per-date sum of unrounded eaten rows equals sumEatenTotals', () => {
    const logs = [
      mkLog({ meal_slot: 'b', serving_amount: 0.35, food_calories: 123, food_protein: 7.77 }),
      mkLog({ meal_slot: 'b', serving_amount: 1.5, food_calories: 55, food_protein: 3.3 }),
      mkLog({ meal_slot: 'l', serving_amount: 2, food_calories: 210, food_protein: 12.5 }),
      mkLog({ meal_slot: 'gone', serving_amount: 0.5, food_calories: 99, food_protein: 1.1 }),
    ];
    const confs = [{ date: '2026-06-01', meal_slot: 'l', confirmed: false }];
    const rows = buildExportRows(logs, DEFS, NAMES, confs);
    const eatenIds = new Set(rows.filter((r) => r.status === 'Eaten').map((r) => r.food + r.meal));
    expect(eatenIds.size).toBeGreaterThan(0);

    const expected = sumEatenTotals(logs, confs);
    const eatenLogs = logs.filter((l) => l.meal_slot !== 'l');
    const unrounded = eatenLogs.reduce(
      (a, l) => ({
        calories: a.calories + logTotals(l).calories,
        protein: a.protein + logTotals(l).protein,
      }),
      { calories: 0, protein: 0 }
    );
    expect(unrounded.calories).toBeCloseTo(expected.calories, 9);
    expect(unrounded.protein).toBeCloseTo(expected.protein, 9);
    // Planned rows are the lunch slot only, and eaten rows count all remaining logs.
    expect(rows.filter((r) => r.status === 'Planned')).toHaveLength(1);
    expect(rows.filter((r) => r.status === 'Eaten')).toHaveLength(eatenLogs.length);
  });
});

describe('rangeDates', () => {
  it('7d includes both ends', () => {
    expect(rangeDates('7d', '2026-06-10')).toEqual({ start: '2026-06-04', end: '2026-06-10' });
  });
  it('30d spans 30 days inclusive', () => {
    expect(rangeDates('30d', '2026-06-30')).toEqual({ start: '2026-06-01', end: '2026-06-30' });
  });
  it('crosses month boundaries', () => {
    expect(rangeDates('7d', '2026-03-03').start).toBe('2026-02-25');
  });
  it('crosses year boundaries', () => {
    expect(rangeDates('7d', '2026-01-03').start).toBe('2025-12-28');
    expect(rangeDates('30d', '2026-01-10').start).toBe('2025-12-12');
  });
  it('handles leap day', () => {
    expect(rangeDates('7d', '2024-03-02').start).toBe('2024-02-25');
  });
  it('"all" has no bounds', () => {
    expect(rangeDates('all', '2026-06-10')).toEqual({ start: null, end: null });
  });
});

describe('exportFileName', () => {
  it('uses the range for bounded exports', () => {
    expect(exportFileName('2026-06-04', '2026-06-10', '2026-06-10')).toBe(
      'binofit-food-log-2026-06-04-to-2026-06-10.csv'
    );
  });
  it('uses today for all-time exports', () => {
    expect(exportFileName(null, null, '2026-06-10')).toBe('binofit-food-log-all-2026-06-10.csv');
  });
});

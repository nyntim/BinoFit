import * as SQLite from 'expo-sqlite';

const baseRow = {
  id: 'u1', name: 'Test food', serving_size: 100, serving_unit: 'g',
  calories: 200, protein: 10, carbs: 20, fat: 5,
  fiber: null, sugar: null, sodium: null, saturated_fat: null, trans_fat: null,
  vitamin_d: null, calcium: null, iron: null, potassium: null, updated_at: '2024-01-01',
};

function mockFoodsDb(row: any) {
  const fake = {
    getFirstAsync: jest.fn(async (sql: string) => (sql.includes('COUNT') ? { c: 1 } : row)),
    getAllAsync: jest.fn(async () => (row ? [row] : [])),
  };
  const SQLite = require('expo-sqlite');
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(fake);
  return fake;
}

// Re-require per test so the module-level db cache doesn't leak between tests.
const load = () => require('@/lib/foods-db') as typeof import('@/lib/foods-db');

beforeEach(() => {
  jest.resetModules();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('mapUSDARow (via getUSDAFoodById)', () => {
  it('scales per-100g macros to a 150g serving with rounding', async () => {
    mockFoodsDb({ ...baseRow, serving_size: 150, calories: 201, protein: 10.33, carbs: 20.05, fat: 4.44 });
    const f = await load().getUSDAFoodById('u1');
    expect(f).toMatchObject({ calories: 302, protein: 15.5, carbs: 30.1, fat: 6.7, serving_units: '150g' });
  });
  it('scales micronutrients without rounding away source precision', async () => {
    mockFoodsDb({ ...baseRow, serving_size: 28, vitamin_d: 0.123456, iron: 1.2345, fiber: 3 });
    const f = await load().getUSDAFoodById('u1');
    expect(f!.vitamin_d).toBeCloseTo(0.123456 * 0.28, 12);
    expect(f!.iron).toBeCloseTo(1.2345 * 0.28, 12);
    expect(f!.fiber).toBeCloseTo(0.84, 12);
  });
  it('maps every bundled nutrient in its existing canonical unit and leaves absent columns unknown', async () => {
    const values = { monounsat_fat: 2, polyunsat_fat: 3, vitamin_a: 125, vitamin_c: 5,
      vitamin_e: 0.2, vitamin_k: 0.005, thiamin: 0, riboflavin: 0.4, niacin: 1,
      b6: 0.3, folate: 15, b12: 0.0001, choline: 20, magnesium: 40, zinc: 2,
      phosphorus: 15, copper: 0.1, manganese: 0.2, selenium: 5 };
    mockFoodsDb({ ...baseRow, ...values, serving_size: 25 });
    const f = await load().getUSDAFoodById('u1');
    for (const [id, value] of Object.entries(values)) {
      expect((f as unknown as Record<string, unknown>)[id]).toBe(value * 0.25);
    }
    expect(f).toMatchObject({ added_sugar: null, cholesterol: null });
  });
  it('keeps null micronutrients as null (not 0)', async () => {
    mockFoodsDb({ ...baseRow });
    const f = await load().getUSDAFoodById('u1');
    expect(f!.fiber).toBeNull();
    expect(f!.potassium).toBeNull();
  });
  it('preserves a real 0 micronutrient', async () => {
    mockFoodsDb({ ...baseRow, sugar: 0 });
    expect((await load().getUSDAFoodById('u1'))!.sugar).toBe(0);
  });
  it('defaults missing serving size to 100g and null macros to 0', async () => {
    mockFoodsDb({ ...baseRow, serving_size: null, serving_unit: null, calories: null, protein: null, carbs: null, fat: null });
    const f = await load().getUSDAFoodById('u1');
    expect(f).toMatchObject({ serving_units: '100g', calories: 0, protein: 0, carbs: 0, fat: 0 });
  });
  it('uses the raw unit label for non-gram serving units', async () => {
    mockFoodsDb({ ...baseRow, serving_size: 240, serving_unit: 'ml' });
    expect((await load().getUSDAFoodById('u1'))!.serving_units).toBe('ml');
  });
  it('tags source and null brand', async () => {
    mockFoodsDb({ ...baseRow });
    expect(await load().getUSDAFoodById('u1')).toMatchObject({ source: 'usda_sr_legacy', brand: null });
  });
  it('keeps the row source for Foundation foods', async () => {
    mockFoodsDb({ ...baseRow, source: 'usda_foundation' });
    expect((await load().getUSDAFoodById('u1'))!.source).toBe('usda_foundation');
  });
  it('falls back to usda_sr_legacy when the row source is null', async () => {
    mockFoodsDb({ ...baseRow, source: null });
    expect((await load().getUSDAFoodById('u1'))!.source).toBe('usda_sr_legacy');
  });
  it('returns null when the row is missing', async () => {
    mockFoodsDb(null);
    expect(await load().getUSDAFoodById('nope')).toBeNull();
  });
  it('returns null instead of throwing when the db fails to open', async () => {
    (SQLite.openDatabaseAsync as jest.Mock).mockRejectedValue(new Error('boom'));
    expect(await load().getUSDAFoodById('u1')).toBeNull();
  });
});

describe('searchUSDAFoods', () => {
  it('returns [] for a blank query without running the search', async () => {
    const fake = mockFoodsDb(baseRow);
    expect(await load().searchUSDAFoods('   ')).toEqual([]);
    expect(fake.getAllAsync).not.toHaveBeenCalled();
  });
  it('reads immutable metadata once, then hydrates matching rows in one parameterized batch', async () => {
    const fake = mockFoodsDb({ ...baseRow, name: 'Red apple' });
    const api = load();
    expect(await api.searchUSDAFoods('red apple')).toHaveLength(1);
    await api.searchUSDAFoods('red apple');
    const metadataCalls = fake.getAllAsync.mock.calls.filter((call: any[]) => call[0].startsWith('SELECT id, name, source'));
    expect(metadataCalls).toHaveLength(1);
    expect(fake.getAllAsync).toHaveBeenCalledWith('SELECT * FROM foods WHERE id IN (?)', ['u1']);
  });
  it('retries a rejected metadata promise and shares concurrent successful reads', async () => {
    const fake = mockFoodsDb(baseRow);
    fake.getAllAsync.mockRejectedValueOnce(new Error('read failed'));
    const api = load();
    await expect(api.getUSDASearchMetadata()).rejects.toThrow('read failed');
    const [first, second] = await Promise.all([api.getUSDASearchMetadata(), api.getUSDASearchMetadata()]);
    expect(first).toBe(second);
    expect(fake.getAllAsync).toHaveBeenCalledTimes(2);
  });
  it('scales batch hydration exactly as an individual USDA lookup', async () => {
    mockFoodsDb({ ...baseRow, serving_size: 25, iron: 2, source: 'usda_foundation' });
    const api = load();
    expect(await api.getUSDAFoodsByIds(['u1'])).toEqual([await api.getUSDAFoodById('u1')]);
    expect(await api.getUSDAFoodsByIds([])).toEqual([]);
  });
});

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
  it('scales micronutrients with 3 decimals', async () => {
    mockFoodsDb({ ...baseRow, serving_size: 28, vitamin_d: 0.123456, iron: 1.2345, fiber: 3 });
    const f = await load().getUSDAFoodById('u1');
    expect(f!.vitamin_d).toBe(0.035);
    expect(f!.iron).toBe(0.346);
    expect(f!.fiber).toBe(0.84);
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
  it('builds one LIKE condition per word and maps rows', async () => {
    const fake = mockFoodsDb(baseRow);
    const res = await load().searchUSDAFoods('red apple');
    expect(res).toHaveLength(1);
    const [sql, params] = fake.getAllAsync.mock.calls[0] as unknown as [string, any[]];
    expect(sql).toContain('name LIKE ? AND name LIKE ?');
    expect(params).toEqual(['%red%', '%apple%', 'red apple', 'red apple', 50]);
  });
});

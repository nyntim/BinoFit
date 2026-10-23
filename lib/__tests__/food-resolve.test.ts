import { cacheRemoteFood, getFoodById, hasAnyMicros } from '@/lib/database';
import { getUSDAFoodById } from '@/lib/foods-db';
import { getFullBrandedFood } from '@/lib/food-service';
import { needsRemoteDetails, resolveLoggableFood } from '@/lib/food-resolve';
import type { Food } from '@/lib/types';

jest.mock('@/lib/database', () => ({ getFoodById: jest.fn(), cacheRemoteFood: jest.fn(), hasAnyMicros: jest.fn() }));
jest.mock('@/lib/foods-db', () => ({ getUSDAFoodById: jest.fn() }));
jest.mock('@/lib/food-service', () => ({ getFullBrandedFood: jest.fn() }));

const f = (over: Partial<Food>): Food => ({ id: 'x', name: 'X', brand: null, serving_units: '1', calories: 1, protein: 1, carbs: 1, fat: 1, source: 'usda', updated_at: 'x', ...over } as Food);
beforeEach(() => {
  jest.resetAllMocks();
  (hasAnyMicros as jest.Mock).mockImplementation((food: Food) => food.name === 'micros');
});

test('needsRemoteDetails', () => {
  expect(needsRemoteDetails(f({ source: 'open_food_facts', detailsPending: true }))).toBe(true);
  expect(needsRemoteDetails(f({ source: 'branded' }))).toBe(true);
  expect(needsRemoteDetails(f({ source: 'other', brand: 'B' }))).toBe(true);
  expect(needsRemoteDetails(f({ source: 'custom', brand: 'B' }))).toBe(false);
  expect(needsRemoteDetails(f({ source: 'open_food_facts', brand: 'B' }))).toBe(false);
  expect(needsRemoteDetails(f({ source: 'usda', brand: 'B' }))).toBe(false);
});

describe('branded', () => {
  const branded = f({ id: 'b', source: 'branded', brand: 'B' });
  it('returns the fetched full row', async () => {
    const full = f({ id: 'b', name: 'full' });
    (getFoodById as jest.Mock).mockResolvedValue(null); (getFullBrandedFood as jest.Mock).mockResolvedValue(full);
    expect(await resolveLoggableFood(branded)).toBe(full);
  });
  it('offline falls back to a local row that has micros, else null', async () => {
    (getFullBrandedFood as jest.Mock).mockResolvedValue(null);
    const withMicros = f({ id: 'b', name: 'micros' });
    (getFoodById as jest.Mock).mockResolvedValue(withMicros);
    expect(await resolveLoggableFood(branded)).toBe(withMicros);
    (getFoodById as jest.Mock).mockResolvedValue(f({ id: 'b', name: 'partial' }));
    expect(await resolveLoggableFood(branded)).toBeNull();
    (getFoodById as jest.Mock).mockResolvedValue(null);
    expect(await resolveLoggableFood(branded)).toBeNull();
  });
});

describe('usda, custom, off', () => {
  it('caches a USDA food missing locally', async () => {
    const usda = f({ id: 'u' });
    (getFoodById as jest.Mock).mockResolvedValue(null); (getUSDAFoodById as jest.Mock).mockResolvedValue(usda);
    expect(await resolveLoggableFood(f({ id: 'u' }))).toBe(usda);
    expect(cacheRemoteFood).toHaveBeenCalledWith(usda);
  });
  it('uses a local USDA row that has micros without reading the asset', async () => {
    const local = f({ id: 'u', name: 'micros' });
    (getFoodById as jest.Mock).mockResolvedValue(local);
    expect(await resolveLoggableFood(f({ id: 'u' }))).toBe(local);
    expect(getUSDAFoodById).not.toHaveBeenCalled();
  });
  it('returns the local row for custom and OFF with no network', async () => {
    for (const source of ['custom', 'open_food_facts']) {
      const local = f({ id: source, source });
      (getFoodById as jest.Mock).mockResolvedValue(local);
      expect(await resolveLoggableFood(local)).toBe(local);
    }
    expect(getFullBrandedFood).not.toHaveBeenCalled();
    expect(getUSDAFoodById).not.toHaveBeenCalled();
  });
  it('returns null when nothing is found and never throws', async () => {
    (getFoodById as jest.Mock).mockResolvedValue(null); (getUSDAFoodById as jest.Mock).mockResolvedValue(null);
    expect(await resolveLoggableFood(f({ id: 'u' }))).toBeNull();
    (getFoodById as jest.Mock).mockRejectedValue(new Error('boom'));
    expect(await resolveLoggableFood(f({ id: 'u' }))).toBeNull();
  });
});

test('batch resolution hydrates a pending OFF summary even without a brand', async () => {
  const summary = f({ id: 'off:1', source: 'open_food_facts', detailsPending: true });
  const full = { ...summary, detailsPending: false, fiber: 2 };
  (getFoodById as jest.Mock).mockResolvedValue(null);
  (getFullBrandedFood as jest.Mock).mockResolvedValue(full);
  expect(await resolveLoggableFood(summary)).toBe(full);
  expect(getFullBrandedFood).toHaveBeenCalledWith('off:1');
});

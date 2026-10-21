import type { Food } from '@/lib/types';

const food = (id: string): Food => ({ id, name: id, brand: null, serving_units: '1', calories: 100, protein: 1, carbs: 1, fat: 1, source: 'usda', updated_at: 'x' } as Food);
let store: typeof import('@/lib/food-selection-store');
const addFoodLogsBatch = jest.fn();
const resolveLoggableFood = jest.fn();
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.resetModules();
  addFoodLogsBatch.mockReset().mockResolvedValue([]);
  resolveLoggableFood.mockReset().mockImplementation(async (f: Food) => f);
  jest.doMock('@/lib/database', () => ({ addFoodLogsBatch }));
  jest.doMock('@/lib/food-resolve', () => ({ resolveLoggableFood }));
  jest.doMock('@/lib/storage', () => ({ getDefaultLogStatus: async () => 'planned' }));
  store = require('@/lib/food-selection-store');
  store.beginFoodSelection({ meal_slot: 'm1', date: '2026-10-20' });
});

it('beginFoodSelection resets the draft', async () => {
  store.toggleSelectedFood(food('a')); await flush();
  store.beginFoodSelection({ meal_slot: 'm2', date: '2026-10-21' });
  expect(store.getFoodSelection()).toMatchObject({ order: [], context: { meal_slot: 'm2' } });
});

it('ignores a resolve that arrives after removal', async () => {
  let release!: (f: Food) => void;
  resolveLoggableFood.mockReturnValueOnce(new Promise((r) => { release = r; }));
  store.toggleSelectedFood(food('a'));
  store.removeSelectedFood('a');
  release(food('a')); await flush();
  expect(store.getFoodSelection().order).toEqual([]);
});

it('two concurrent commits write once, and the draft clears after success', async () => {
  store.toggleSelectedFood(food('a')); await flush();
  const [a, b] = [store.commitFoodSelection(), store.commitFoodSelection()];
  expect(a).toBe(b);
  await a;
  expect(addFoodLogsBatch).toHaveBeenCalledTimes(1);
  expect(addFoodLogsBatch).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-10-20', meal_slot: 'm1', defaultEaten: false }));
  expect(store.getFoodSelection().order).toEqual([]);
});

it('a failed commit keeps the draft and a retry succeeds', async () => {
  store.toggleSelectedFood(food('a')); await flush();
  addFoodLogsBatch.mockRejectedValueOnce(new Error('db'));
  await expect(store.commitFoodSelection()).rejects.toThrow('db');
  expect(store.getFoodSelection().order).toEqual(['a']);
  await expect(store.commitFoodSelection()).resolves.toBe('saved');
  expect(store.getFoodSelection().order).toEqual([]);
});

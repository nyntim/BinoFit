import { createMemoryDb } from '@/test-utils/sqlite-memory';

const mockUpsert = jest.fn();
const mockTables: string[] = [];
jest.mock('@/lib/supabase', () => ({ supabase: { from: (table: string) => ({ upsert: (rows: unknown[]) => { mockTables.push(table); return mockUpsert(table, rows); } }) } }));
jest.mock('@/lib/auth', () => ({
  getSessionUserId: jest.fn(async () => 'owner'), initAuth: jest.fn(),
  retryPendingMergeTicket: jest.fn(async () => {}), reconcileSyncedUid: jest.fn(async () => {}),
}));
jest.mock('@/lib/storage', () => ({
  getUserGoals: jest.fn(async () => null), getUserProfile: jest.fn(async () => null), setLastSyncAt: jest.fn(),
}));

let db: typeof import('@/lib/database');
let sync: typeof import('@/lib/sync').syncToSupabase;
let state: typeof import('@/lib/sync-status').getSyncState;
beforeEach(() => {
  jest.resetModules();
  const mem = createMemoryDb();
  require('expo-sqlite').openDatabaseAsync.mockResolvedValue(mem);
  db = require('@/lib/database');
  sync = require('@/lib/sync').syncToSupabase;
  state = require('@/lib/sync-status').getSyncState;
  mockTables.length = 0;
  mockUpsert.mockReset().mockResolvedValue({ error: null });
});
const input = { name: 'Mine', brand: null, serving_units: '100g', calories: 100, protein: 1, carbs: 2, fat: 3, source: 'custom', fiber: 0, b12: .000001, added_sugar: null, barcode: '0123' };

test('unlogged offline food uploads all nutrient nulls and zero without local metadata', async () => {
  const food = await db.addCustomFood(input);
  expect(await db.getUnsyncedCustomFoods()).toHaveLength(1);
  await sync();
  expect(mockUpsert).toHaveBeenCalledWith('foods', [expect.objectContaining({ id: food.id, user_id: 'owner', fiber: 0, added_sugar: null, choline: null, b12: .000001 })]);
  const payload = mockUpsert.mock.calls.find(([table]) => table === 'foods')[1][0];
  expect(payload).not.toHaveProperty('barcode');
  expect(payload).not.toHaveProperty('synced_at');
  expect(payload).not.toHaveProperty('matchTier');
  expect(await db.getUnsyncedCustomFoods()).toHaveLength(0);
  expect(state().status).toBe('success');
});
test('error reports failure and leaves definition dirty; retry pushes custom foods before logs', async () => {
  const food = await db.addCustomFood(input);
  await db.addFoodLog({ date: '2026-01-01', meal_slot: 'lunch', food_id: food.id, serving_amount: 1, serving_unit: '100g' });
  mockUpsert.mockResolvedValueOnce({ error: { message: 'offline' } });
  await sync();
  expect(state().status).toBe('failed');
  expect(await db.getUnsyncedCustomFoods()).toHaveLength(1);
  expect(await db.getUnsyncedFoodLogs()).toHaveLength(1);
  mockTables.length = 0;
  await sync();
  expect(mockTables.slice(0, 2)).toEqual(['foods', 'food_logs']);
  expect(await db.getUnsyncedCustomFoods()).toHaveLength(0);
  expect(await db.getUnsyncedFoodLogs()).toHaveLength(0);
});
test('edit during upload remains dirty and later retry uploads the explicit clear', async () => {
  const food = await db.addCustomFood(input);
  mockUpsert.mockImplementationOnce(async () => {
    await db.updateCustomFood(food.id, { ...food, fiber: null });
    return { error: null };
  });
  await sync();
  expect(await db.getUnsyncedCustomFoods()).toHaveLength(1);
  await sync();
  const pushes = mockUpsert.mock.calls.filter(([table]) => table === 'foods');
  expect(pushes[1][1][0].fiber).toBeNull();
  expect(await db.getUnsyncedCustomFoods()).toHaveLength(0);
});

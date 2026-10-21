import { createMemoryDb } from '@/test-utils/sqlite-memory';

let mem: ReturnType<typeof createMemoryDb>;
let database: typeof import('@/lib/database');

beforeEach(async () => {
  jest.resetModules();
  mem = createMemoryDb();
  (require('expo-sqlite').openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  database = require('@/lib/database');
  await database.getDatabase();
  for (const id of ['f1', 'f2', 'f3']) {
    mem.raw.prepare(`INSERT INTO foods (id,name,serving_units,calories,protein,carbs,fat,source,updated_at) VALUES (?,?,'1',70,6,0,5,'custom','x')`).run(id, `Food ${id}`);
  }
});

const batch = (items: { food_id: string; serving_amount: number; serving_unit: string }[], defaultEaten = true) =>
  database.addFoodLogsBatch({ date: '2026-10-20', meal_slot: 'm1', logged_time: '12:30', items, defaultEaten });
const logCount = () => (mem.raw.prepare('SELECT COUNT(*) c FROM food_logs').get() as { c: number }).c;
const statuses = () => mem.raw.prepare('SELECT confirmed FROM meal_slot_confirmations WHERE date = ? AND meal_slot = ?').all('2026-10-20', 'm1') as { confirmed: number }[];

it('inserts every log unsynced and creates the default status', async () => {
  const logs = await batch([{ food_id: 'f1', serving_amount: 1.5, serving_unit: '1' }, { food_id: 'f2', serving_amount: 2, serving_unit: '1' }], false);
  expect(logs).toHaveLength(2);
  const rows = await database.getUnsyncedFoodLogs();
  expect(rows.map((r) => [r.food_id, r.serving_amount, r.date, r.meal_slot, r.synced_at])).toEqual(
    expect.arrayContaining([['f1', 1.5, '2026-10-20', 'm1', null], ['f2', 2, '2026-10-20', 'm1', null]])
  );
  expect(statuses()).toEqual([{ confirmed: 0 }]);
  const joined = await database.getFoodLogsWithFoodByDate('2026-10-20');
  expect(joined.map((l) => l.food_id).sort()).toEqual(['f1', 'f2']);
});

it('keeps an existing slot status', async () => {
  await database.ensureMealSlotStatus('2026-10-20', 'm1', false);
  await batch([{ food_id: 'f1', serving_amount: 1, serving_unit: '1' }], true);
  expect(statuses()).toEqual([{ confirmed: 0 }]);
});

it('rolls back everything when a food is missing', async () => {
  await expect(batch([{ food_id: 'f1', serving_amount: 1, serving_unit: '1' }, { food_id: 'nope', serving_amount: 1, serving_unit: '1' }])).rejects.toThrow('Missing food');
  expect(logCount()).toBe(0);
  expect(statuses()).toEqual([]);
});

it('rolls back when an insert fails mid-batch', async () => {
  await expect(batch([{ food_id: 'f1', serving_amount: 1, serving_unit: '1' }, { food_id: 'f2', serving_amount: null as any, serving_unit: '1' }])).rejects.toBeTruthy();
  expect(logCount()).toBe(0);
  expect(statuses()).toEqual([]);
});

it('rejects an empty list', async () => {
  await expect(batch([])).rejects.toThrow();
  expect(logCount()).toBe(0);
});

import { createMemoryDb } from '@/test-utils/sqlite-memory';

let mem: ReturnType<typeof createMemoryDb>;
let database: typeof import('@/lib/database');

beforeEach(async () => {
  jest.resetModules();
  mem = createMemoryDb();
  const SQLite = require('expo-sqlite');
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  database = require('@/lib/database');
  await database.getDatabase();
  mem.raw
    .prepare(
      `INSERT INTO foods (id,name,brand,serving_units,calories,protein,carbs,fat,source,updated_at)
       VALUES ('f1','Egg','Farm','1',70,6,0,5,'custom','x')`
    )
    .run();
});

const addLog = (id: string, date: string, created = 'x', food = 'f1') =>
  mem.raw
    .prepare(
      `INSERT INTO food_logs (id,date,meal_slot,food_id,serving_amount,serving_unit,created_at,updated_at)
       VALUES (?,?,'breakfast',?,1,'1',?,'x')`
    )
    .run(id, date, food, created);

const addConf = (id: string, date: string, confirmed: number) =>
  mem.raw
    .prepare(
      `INSERT INTO meal_slot_confirmations (id,date,meal_slot,confirmed,updated_at)
       VALUES (?,?,'breakfast',?,'x')`
    )
    .run(id, date, confirmed);

describe('getFoodLogsWithFoodInRange', () => {
  it('includes both end dates and excludes outside dates', async () => {
    ['2026-05-31', '2026-06-01', '2026-06-05', '2026-06-07', '2026-06-08'].forEach((d, i) =>
      addLog(`l${i}`, d)
    );
    const rows = await database.getFoodLogsWithFoodInRange('2026-06-01', '2026-06-07');
    expect(rows.map((r) => r.date)).toEqual(['2026-06-01', '2026-06-05', '2026-06-07']);
  });

  it('returns rows ordered by date then created_at', async () => {
    addLog('a', '2026-06-02', '2');
    addLog('b', '2026-06-01', '9');
    addLog('c', '2026-06-01', '1');
    const rows = await database.getFoodLogsWithFoodInRange('2026-06-01', '2026-06-02');
    expect(rows.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('joins food fields including brand', async () => {
    addLog('a', '2026-06-01');
    const [r] = await database.getFoodLogsWithFoodInRange('2026-06-01', '2026-06-01');
    expect(r).toMatchObject({ food_name: 'Egg', food_brand: 'Farm', food_calories: 70 });
  });

  it('drops logs whose food is missing', async () => {
    addLog('a', '2026-06-01');
    mem.raw.pragma('foreign_keys = OFF');
    addLog('orphan', '2026-06-01', 'x', 'missing');
    const rows = await database.getFoodLogsWithFoodInRange('2026-06-01', '2026-06-01');
    expect(rows.map((r) => r.id)).toEqual(['a']);
  });

  it('treats null bounds as open', async () => {
    ['2020-01-01', '2026-06-01', '2030-01-01'].forEach((d, i) => addLog(`l${i}`, d));
    expect(await database.getFoodLogsWithFoodInRange(null, null)).toHaveLength(3);
    expect(await database.getFoodLogsWithFoodInRange('2026-06-01', null)).toHaveLength(2);
    expect(await database.getFoodLogsWithFoodInRange(null, '2026-06-01')).toHaveLength(2);
  });

  it('returns an empty list for an empty range', async () => {
    expect(await database.getFoodLogsWithFoodInRange('2026-06-01', '2026-06-07')).toEqual([]);
  });
});

describe('getMealSlotConfirmationsInRange', () => {
  it('includes both ends and maps confirmed to booleans', async () => {
    addConf('c0', '2026-05-31', 1);
    addConf('c1', '2026-06-01', 0);
    addConf('c2', '2026-06-07', 1);
    addConf('c3', '2026-06-08', 1);
    const rows = await database.getMealSlotConfirmationsInRange('2026-06-01', '2026-06-07');
    expect(rows.map((r) => [r.date, r.confirmed])).toEqual([
      ['2026-06-01', false],
      ['2026-06-07', true],
    ]);
  });

  it('treats null bounds as open', async () => {
    addConf('c0', '2020-01-01', 1);
    addConf('c1', '2030-01-01', 0);
    expect(await database.getMealSlotConfirmationsInRange(null, null)).toHaveLength(2);
    expect(await database.getMealSlotConfirmationsInRange('2025-01-01', null)).toHaveLength(1);
    expect(await database.getMealSlotConfirmationsInRange(null, '2025-01-01')).toHaveLength(1);
  });
});

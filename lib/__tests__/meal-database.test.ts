import { createMemoryDb } from '@/test-utils/sqlite-memory';
import { buildDraft, type MealDraft } from '@/lib/meals';

let mem: ReturnType<typeof createMemoryDb>;
let database: typeof import('@/lib/database');

beforeEach(() => {
  jest.resetModules();
  mem = createMemoryDb();
  const SQLite = require('expo-sqlite');
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  database = require('@/lib/database');
});

const TODAY = '2026-06-01';

const loadDraft = async (): Promise<MealDraft> =>
  buildDraft(await database.getMealDefinitions(), await database.getMealNames(), TODAY);

const insertLog = (id: string, meal: string, date: string, synced: string | null = null) => {
  mem.raw
    .prepare(
      `INSERT OR IGNORE INTO foods (id,name,serving_units,calories,protein,carbs,fat,source,updated_at)
       VALUES ('f1','Egg','1',70,6,0,5,'custom','x')`
    )
    .run();
  mem.raw
    .prepare(
      `INSERT INTO food_logs (id,date,meal_slot,food_id,serving_amount,serving_unit,created_at,updated_at,synced_at)
       VALUES (?,?,?,'f1',1,'1','x','x',?)`
    )
    .run(id, date, meal, synced);
};

describe('getDatabase', () => {
  it('concurrent first callers share one fully initialised database', async () => {
    const SQLite = require('expo-sqlite');
    const [a, b] = await Promise.all([database.getDatabase(), database.getDatabase()]);
    expect(a).toBe(b);
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
    const rows = await a.getAllAsync('SELECT id FROM meal_definitions');
    expect(rows).toHaveLength(4);
  });

  it('retries after an init failure', async () => {
    const SQLite = require('expo-sqlite');
    (SQLite.openDatabaseAsync as jest.Mock).mockRejectedValueOnce(new Error('open failed'));
    await expect(database.getDatabase()).rejects.toThrow('open failed');
    await expect(database.getDatabase()).resolves.toBeTruthy();
  });
});

describe('default meal seed', () => {
  it('seeds the four defaults once with names effective for all history', async () => {
    const defs = await database.getMealDefinitions();
    expect(defs.map((d) => [d.id, d.position])).toEqual([
      ['breakfast', 0],
      ['lunch', 1],
      ['dinner', 2],
      ['snack', 3],
    ]);
    const names = await database.getMealNames();
    expect(names).toHaveLength(4);
    expect(names.every((n) => n.effective_from === '0000-01-01')).toBe(true);
    expect(names.find((n) => n.meal_id === 'snack')?.name).toBe('Snacks');
  });

  it('never reseeds after defaults are deleted', async () => {
    const d = await loadDraft();
    await database.saveMealDraft(
      { meals: [{ ...d.meals[0] }], deletedIds: ['lunch', 'dinner', 'snack'] },
      TODAY
    );
    // Reopen the same database file: initSchema runs again.
    jest.resetModules();
    const SQLite = require('expo-sqlite');
    (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
    const again = require('@/lib/database') as typeof import('@/lib/database');
    expect((await again.getMealDefinitions()).map((m) => m.id)).toEqual(['breakfast']);
  });
});

describe('seed extras', () => {
  it('does not reseed after a rename when initialised again', async () => {
    const d = await loadDraft();
    d.meals[0].name = 'Morning';
    await database.saveMealDraft(d, TODAY);
    jest.resetModules();
    const SQLite = require('expo-sqlite');
    (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
    const again = require('@/lib/database') as typeof import('@/lib/database');
    const names = (await again.getMealNames()).filter((n) => n.meal_id === 'breakfast');
    expect(names.map((n) => n.name)).toEqual(['Breakfast', 'Morning']);
    expect(await again.getMealDefinitions()).toHaveLength(4);
  });

  it('resolves existing breakfast logs to a defined meal', async () => {
    await database.getDatabase();
    insertLog('l1', 'breakfast', '2026-05-01');
    const { mealsForDay } = require('@/lib/meals') as typeof import('@/lib/meals');
    const r = mealsForDay(
      await database.getMealDefinitions(),
      await database.getMealNames(),
      [{ meal_slot: 'breakfast' }],
      '2026-05-01'
    );
    expect(r.some((m) => m.orphan)).toBe(false);
    expect(r[0].name).toBe('Breakfast');
  });
});

describe('saveMealDraft extras', () => {
  const allIds = ['breakfast', 'lunch', 'dinner', 'snack'];
  const markAllSynced = async () => {
    await database.markMealDefinitionsSynced(allIds);
    await database.markMealNamesSynced(
      allIds.map((meal_id) => ({ meal_id, effective_from: '0000-01-01' }))
    );
  };

  it('resets synced_at on renamed and retargeted meals only', async () => {
    await markAllSynced();
    const d = await loadDraft();
    d.meals[0].name = 'Morning';
    d.meals[1].calorie_target = 600;
    await database.saveMealDraft(d, TODAY);
    expect((await database.getUnsyncedMealDefinitions()).map((m) => m.id)).toEqual(['lunch']);
    const names = await database.getUnsyncedMealNames();
    expect(names.map((n) => [n.meal_id, n.effective_from])).toEqual([['breakfast', TODAY]]);
  });

  it('persists reminder_time and re-marks only that meal unsynced', async () => {
    await markAllSynced();
    const d = await loadDraft();
    d.meals[2].reminder_time = '18:30';
    await database.saveMealDraft(d, TODAY);
    const defs = await database.getMealDefinitions();
    expect(defs.map((m) => m.reminder_time)).toEqual([null, null, '18:30', null]);
    expect((await database.getUnsyncedMealDefinitions()).map((m) => m.id)).toEqual(['dinner']);

    await database.markMealDefinitionsSynced(['dinner']);
    d.meals[2].reminder_time = null;
    await database.saveMealDraft(d, TODAY);
    expect((await database.getMealDefinitions())[2].reminder_time).toBeNull();
    expect((await database.getUnsyncedMealDefinitions()).map((m) => m.id)).toEqual(['dinner']);
  });

  it('adds reminder_time to an existing meal_definitions table and keeps rows', async () => {
    mem.raw.exec(`
      CREATE TABLE meal_definitions (id TEXT PRIMARY KEY, position INTEGER NOT NULL, calorie_target REAL,
        protein_target REAL, carb_target REAL, fat_target REAL, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL, synced_at TEXT);
      INSERT INTO meal_definitions VALUES ('lunch', 0, 500, NULL, NULL, NULL, 'x', 'x', 'x');
    `);
    expect(await database.getMealDefinitions()).toEqual([
      expect.objectContaining({ id: 'lunch', calorie_target: 500, reminder_time: null }),
    ]);
  });

  it('saving an unchanged draft changes nothing', async () => {
    await markAllSynced();
    await database.saveMealDraft(await loadDraft(), TODAY);
    expect(await database.getUnsyncedMealDefinitions()).toEqual([]);
    expect(await database.getUnsyncedMealNames()).toEqual([]);
  });

  it('trims names when saving', async () => {
    const d = await loadDraft();
    d.meals[0].name = '  Morning  ';
    await database.saveMealDraft(d, TODAY);
    const n = (await database.getMealNames()).find(
      (x) => x.meal_id === 'breakfast' && x.effective_from === TODAY
    );
    expect(n?.name).toBe('Morning');
  });

  it('delete leaves other meals data untouched and renumbers positions', async () => {
    await database.getDatabase();
    insertLog('l1', 'lunch', '2026-05-01');
    insertLog('l2', 'dinner', '2026-05-01');
    await database.upsertMealSlotConfirmation('2026-05-01', 'lunch', true);
    await database.upsertMealSlotConfirmation('2026-05-01', 'dinner', false);
    const d = await loadDraft();
    await database.saveMealDraft(
      { meals: d.meals.filter((m) => m.id !== 'lunch'), deletedIds: ['lunch'] },
      TODAY
    );
    expect(await database.countFoodLogsForMeal('dinner')).toBe(1);
    const conf = await database.getMealSlotConfirmationsByDate('2026-05-01');
    expect(conf.map((c) => c.meal_slot)).toEqual(['dinner']);
    expect((await database.getMealDefinitions()).map((m) => [m.id, m.position])).toEqual([
      ['breakfast', 0],
      ['dinner', 1],
      ['snack', 2],
    ]);
    expect((await database.getMealNames()).some((n) => n.meal_id === 'dinner')).toBe(true);
  });

  it('rollback leaves renames, order and synced state unchanged', async () => {
    await markAllSynced();
    const d = await loadDraft();
    d.meals[0].name = 'Morning';
    const bad: MealDraft = {
      meals: [
        d.meals[1],
        d.meals[0],
        { ...d.meals[2], id: 'x', isNew: true, name: null as unknown as string },
      ],
      deletedIds: [],
    };
    await expect(database.saveMealDraft(bad, TODAY)).rejects.toBeTruthy();
    expect((await database.getMealDefinitions()).map((m) => m.id)).toEqual(allIds);
    expect(await database.getUnsyncedMealDefinitions()).toEqual([]);
    expect((await database.getMealNames()).some((n) => n.name === 'Morning')).toBe(false);
  });
});

describe('saveMealDraft', () => {
  it('renames effective today, keeping the earlier name; a same-day rename overwrites', async () => {
    let d = await loadDraft();
    d.meals[3].name = 'Treats';
    await database.saveMealDraft(d, TODAY);
    d = await loadDraft();
    d.meals[3].name = 'Extras';
    await database.saveMealDraft(d, TODAY);
    const rows = (await database.getMealNames()).filter((n) => n.meal_id === 'snack');
    expect(rows.map((r) => [r.name, r.effective_from])).toEqual([
      ['Snacks', '0000-01-01'],
      ['Extras', TODAY],
    ]);
  });

  it('adds a meal, writes positions and targets, and marks changes unsynced', async () => {
    await database.markMealDefinitionsSynced(['breakfast', 'lunch', 'dinner', 'snack']);
    const d = await loadDraft();
    d.meals.push({
      id: 'new-1',
      name: 'Brunch',
      isNew: true,
      reminder_time: null,
      calorie_target: 400,
      protein_target: null,
      carb_target: null,
      fat_target: null,
    });
    d.meals = [d.meals[1], d.meals[0], d.meals[2], d.meals[3], d.meals[4]];
    await database.saveMealDraft(d, TODAY);

    const defs = await database.getMealDefinitions();
    expect(defs.map((m) => m.id)).toEqual(['lunch', 'breakfast', 'dinner', 'snack', 'new-1']);
    expect(defs[4].calorie_target).toBe(400);
    const unsynced = (await database.getUnsyncedMealDefinitions()).map((m) => m.id).sort();
    // dinner and snack kept their positions, so they stay synced
    expect(unsynced).toEqual(['breakfast', 'lunch', 'new-1']);
    expect((await database.getMealNames()).find((n) => n.meal_id === 'new-1')?.name).toBe('Brunch');
  });

  it('deleting a meal removes its logs on every date, statuses, names and definition', async () => {
    await database.getDatabase();
    insertLog('l1', 'snack', '2026-05-01');
    insertLog('l2', 'snack', '2026-05-02');
    insertLog('l3', 'lunch', '2026-05-02');
    await database.upsertMealSlotConfirmation('2026-05-01', 'snack', false);
    expect(await database.countFoodLogsForMeal('snack')).toBe(2);

    const d = await loadDraft();
    await database.saveMealDraft(
      { meals: d.meals.filter((m) => m.id !== 'snack'), deletedIds: ['snack'] },
      TODAY
    );

    expect(await database.countFoodLogsForMeal('snack')).toBe(0);
    expect(await database.countFoodLogsForMeal('lunch')).toBe(1);
    expect(await database.getMealSlotConfirmationsByDate('2026-05-01')).toEqual([]);
    expect((await database.getMealNames()).some((n) => n.meal_id === 'snack')).toBe(false);
    expect((await database.getMealDefinitions()).some((m) => m.id === 'snack')).toBe(false);
  });

  it('rolls back everything when a statement fails', async () => {
    await database.getDatabase();
    insertLog('l1', 'snack', '2026-05-01');
    const d = await loadDraft();
    // A null name violates NOT NULL on meal_names for a new meal, after the delete ran.
    const bad: MealDraft = {
      meals: [
        ...d.meals.filter((m) => m.id !== 'snack'),
        { ...d.meals[0], id: 'x', isNew: true, name: null as unknown as string },
      ],
      deletedIds: ['snack'],
    };
    await expect(database.saveMealDraft(bad, TODAY)).rejects.toBeTruthy();
    expect(await database.countFoodLogsForMeal('snack')).toBe(1);
    expect((await database.getMealDefinitions()).map((m) => m.id)).toContain('snack');
  });

  it('marks names synced individually', async () => {
    await database.markMealNamesSynced([{ meal_id: 'lunch', effective_from: '0000-01-01' }]);
    const unsynced = await database.getUnsyncedMealNames();
    expect(unsynced).toHaveLength(3);
    expect(unsynced.some((n) => n.meal_id === 'lunch')).toBe(false);
  });
});

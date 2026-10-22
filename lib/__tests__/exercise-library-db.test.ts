import { createMemoryDb } from '@/test-utils/sqlite-memory';

let mem: ReturnType<typeof createMemoryDb>;
let database: typeof import('@/lib/database');
let seed: typeof import('@/lib/workouts/exercise-seed');
let lib: typeof import('@/lib/workouts/exercises');
let w: typeof import('@/lib/workouts/db');
let builder: typeof import('@/lib/workouts/exercise-builder');

function load() {
  jest.resetModules();
  const SQLite = require('expo-sqlite');
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  database = require('@/lib/database');
  seed = require('@/lib/workouts/exercise-seed');
  lib = require('@/lib/workouts/exercises');
  w = require('@/lib/workouts/db');
  builder = require('@/lib/workouts/exercise-builder');
}

beforeEach(async () => {
  mem = createMemoryDb();
  load();
  await database.getDatabase();
});

const rowOf = (id: string): any => mem.raw.prepare('SELECT * FROM exercises WHERE id = ?').get(id);
const input = (over: Record<string, unknown> = {}) =>
  builder.draftToExerciseInput(
    { ...builder.emptyDraft('Chest press'), equipment: 'machine', primary: ['chest'], brand: 'Hammer', ...over } as any,
    'kg'
  );

describe('seed data', () => {
  const rows = () => seed.SEED_EXERCISES;
  const cat = () => require('@/lib/workouts/exercise-catalog') as typeof import('@/lib/workouts/exercise-catalog');

  it('has 49 rows with unique ids', () => {
    expect(rows()).toHaveLength(49);
    expect(new Set(rows().map((r) => r.id)).size).toBe(49);
  });

  it('group counts match the spec', () => {
    const count = (g: string) => rows().filter((r) => r.group === g).length;
    const regions = ['Chest', 'Shoulders', 'Triceps', 'Biceps', 'Lats', 'Erectors', 'Abdominals', 'Glutes', 'Quads', 'Hamstrings', 'Adductors', 'Calves', 'Cardio'];
    expect(regions.map(count)).toEqual([7, 5, 3, 3, 6, 1, 3, 2, 6, 2, 2, 1, 8]);
    expect(regions.reduce((n, g) => n + count(g), 0)).toBe(49);
  });

  it('uses valid enums and the group equals the region of the first primary muscle', () => {
    const c = cat();
    const logTypes = c.LOG_TYPE_OPTIONS.map((o) => o.id);
    for (const r of rows()) {
      expect(logTypes).toContain(r.log_type);
      expect(c.EQUIPMENT_OPTIONS).toContain(r.equipment);
      expect(r.primary_muscles.length).toBeGreaterThan(0);
      for (const m of [...r.primary_muscles, ...r.secondary_muscles]) expect(c.MUSCLE_GROUPS).toContain(m);
      expect(c.MUSCLE_REGION[r.primary_muscles[0]]).toBe(r.group);
    }
  });

  it('per side is only on the three starred rep exercises', () => {
    const perSide = rows().filter((r) => r.per_side === 1);
    expect(perSide.map((r) => r.name).sort()).toEqual(['Bulgarian split squat', 'Dumbbell row', 'Walking lunge']);
    for (const r of perSide) expect(cat().isRepLogType(r.log_type)).toBe(true);
  });

  it('cardio equipment decisions follow the spec', () => {
    const eq = (id: string) => rows().find((r) => r.id === id)!.equipment;
    for (const id of ['run', 'walk', 'swim']) expect(eq(id)).toBe('bodyweight');
    expect(eq('jump-rope')).toBe('other');
    for (const id of ['cycle', 'row', 'elliptical', 'stair-climber']) expect(eq(id)).toBe('cardio_machine');
  });

  it('log types follow the spec', () => {
    const lt = (id: string) => rows().find((r) => r.id === id)!.log_type;
    expect(lt('push-up')).toBe('bodyweight_reps');
    expect(lt('pull-up')).toBe('bodyweight_reps');
    expect(lt('plank')).toBe('duration');
    expect(lt('run')).toBe('distance_duration');
    expect(lt('elliptical')).toBe('duration');
    expect(lt('barbell-bench-press')).toBe('weight_reps');
  });
});

describe('seedExercises', () => {
  it('seeds 49 visible rows on first schema init with the version stored', () => {
    expect((mem.raw.prepare("SELECT COUNT(*) c FROM exercises WHERE source='seed' AND hidden=0").get() as any).c).toBe(
      seed.ALL_SEED_EXERCISES.length
    );
    expect((mem.raw.prepare('SELECT value FROM app_meta WHERE key = ?').get(seed.EXERCISE_SEED_VERSION_KEY) as any).value).toBe(
      String(seed.EXERCISE_SEED_VERSION)
    );
  });

  it('reseeding is idempotent', async () => {
    const before = mem.raw.prepare('SELECT * FROM exercises ORDER BY id').all();
    await seed.seedExercises(mem);
    mem.raw.prepare('DELETE FROM app_meta').run();
    await seed.seedExercises(mem);
    const after = mem.raw.prepare('SELECT COUNT(*) c FROM exercises').get() as any;
    expect(after.c).toBe(before.length);
  });

  it('a version bump leaves custom rows and their synced_at alone', async () => {
    const c = await lib.createCustomExercise(input());
    mem.raw.prepare('UPDATE exercises SET synced_at = ? WHERE id = ?').run('2026-01-01T00:00:00.000Z', c.id);
    mem.raw.prepare('UPDATE app_meta SET value = ? WHERE key = ?').run('0', seed.EXERCISE_SEED_VERSION_KEY);
    mem.raw.prepare("UPDATE exercises SET name = 'Old', hidden = 1 WHERE id = 'run'").run();
    await seed.seedExercises(mem);
    const custom = rowOf(c.id);
    expect(custom.synced_at).toBe('2026-01-01T00:00:00.000Z');
    expect(custom.name).toBe('Chest press');
    expect(rowOf('run')).toMatchObject({ name: 'Run', hidden: 0 });
  });

  it('seed version 2 updates seed muscles on a v1 database and leaves custom rows alone', async () => {
    expect(seed.EXERCISE_SEED_VERSION).toBeGreaterThanOrEqual(2);
    const c = await lib.createCustomExercise(input({ primary: ['upper_back'] }));
    mem.raw.prepare('UPDATE app_meta SET value = ? WHERE key = ?').run('1', seed.EXERCISE_SEED_VERSION_KEY);
    mem.raw.prepare("UPDATE exercises SET primary_muscles = '[\"upper_back\"]' WHERE id = 'barbell-row'").run();
    mem.raw.prepare("DELETE FROM exercises WHERE id = 'hip-adduction'").run();
    await seed.seedExercises(mem);
    expect(JSON.parse(rowOf('barbell-row').primary_muscles)).toEqual(['lats', 'upper_back']);
    expect(JSON.parse(rowOf('hip-adduction').primary_muscles)).toEqual(['adductors']);
    expect(JSON.parse(rowOf(c.id).primary_muscles)).toEqual(['upper_back']);
  });

  it('a seed id dropped from the list is hidden, not deleted', async () => {
    mem.raw
      .prepare(
        `INSERT INTO exercises (id,name,log_type,equipment,source,hidden,created_at,updated_at)
         VALUES ('old-seed','Old','weight_reps','barbell','seed',0,'x','x')`
      )
      .run();
    mem.raw.prepare('UPDATE app_meta SET value = ? WHERE key = ?').run('0', seed.EXERCISE_SEED_VERSION_KEY);
    await seed.seedExercises(mem);
    expect(rowOf('old-seed')).toMatchObject({ hidden: 1, deleted_at: null });
  });

  it('does not touch a custom row that shares nothing with the seed list', async () => {
    mem.raw
      .prepare(
        `INSERT INTO exercises (id,name,log_type,equipment,source,hidden,created_at,updated_at)
         VALUES ('mine','Mine','weight_reps','barbell','custom',0,'x','x')`
      )
      .run();
    mem.raw.prepare('UPDATE app_meta SET value = ? WHERE key = ?').run('0', seed.EXERCISE_SEED_VERSION_KEY);
    await seed.seedExercises(mem);
    expect(rowOf('mine').hidden).toBe(0);
  });
});

describe('exercise CRUD', () => {
  it('createCustomExercise inserts an unsynced custom row', async () => {
    const e = await lib.createCustomExercise(input());
    expect(e).toMatchObject({ source: 'custom', synced_at: null, deleted_at: null, brand: 'Hammer' });
    expect(rowOf(e.id)).toMatchObject({ source: 'custom', name: 'Chest press' });
    expect((await lib.getExerciseById(e.id))?.primary_muscles).toEqual(['chest']);
  });

  it('a created custom exercise is returned by getUnsyncedCustomExercises', async () => {
    const e = await lib.createCustomExercise(input());
    const unsynced = await w.getUnsyncedCustomExercises();
    expect(unsynced.map((x) => x.id)).toEqual([e.id]);
  });

  it('update changes fields, bumps updated_at and clears synced_at', async () => {
    const e = await lib.createCustomExercise(input());
    mem.raw.prepare("UPDATE exercises SET synced_at = 'S', updated_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(e.id);
    const u = await lib.updateCustomExercise(e.id, input({ name: 'Renamed' }));
    expect(u?.name).toBe('Renamed');
    expect(u?.synced_at).toBeNull();
    expect(u!.updated_at > '2020-01-01').toBe(true);
  });

  it('update never modifies a seed and returns null for a missing exercise', async () => {
    await lib.updateCustomExercise('run', input({ name: 'Hacked' }));
    expect(rowOf('run').name).toBe('Run');
    expect(await lib.updateCustomExercise('nope', input())).toBeNull();
  });

  it('delete writes a tombstone: hidden from getExercises, still returned by id', async () => {
    const e = await lib.createCustomExercise(input());
    mem.raw.prepare("UPDATE exercises SET synced_at = 'S' WHERE id = ?").run(e.id);
    await lib.deleteCustomExercise(e.id);
    expect(rowOf(e.id).deleted_at).not.toBeNull();
    expect(rowOf(e.id).synced_at).toBeNull();
    expect((await lib.getExercises()).some((x) => x.id === e.id)).toBe(false);
    expect((await lib.getExerciseById(e.id))?.deleted_at).not.toBeNull();
    expect((await w.getUnsyncedCustomExercises()).map((x) => x.id)).toContain(e.id);
  });

  it('seeds cannot be deleted', async () => {
    await lib.deleteCustomExercise('run');
    expect(rowOf('run').deleted_at).toBeNull();
  });

  it('getExercises returns seeds and custom rows', async () => {
    await lib.createCustomExercise(input());
    expect(await lib.getExercises()).toHaveLength(seed.ALL_SEED_EXERCISES.length + 1);
  });

  it('brands are distinct case-insensitively, most recent first, excluding deleted', async () => {
    const mk = async (brand: string | null, at: string) => {
      const e = await lib.createCustomExercise(input({ brand }));
      mem.raw.prepare('UPDATE exercises SET updated_at = ? WHERE id = ?').run(at, e.id);
      return e;
    };
    await mk('Hammer', '2026-01-01T00:00:00.000Z');
    await mk('hammer', '2026-01-02T00:00:00.000Z');
    await mk('Life Fitness', '2026-01-03T00:00:00.000Z');
    const gone = await mk('Gone', '2026-01-04T00:00:00.000Z');
    await mk('', '2026-01-05T00:00:00.000Z');
    await lib.deleteCustomExercise(gone.id);
    expect(await lib.getCustomExerciseBrands()).toEqual(['Life Fitness', 'hammer']);
  });

  it('clearUserData removes custom exercises but keeps seeds', async () => {
    await lib.createCustomExercise(input());
    await database.clearUserData();
    expect((mem.raw.prepare("SELECT COUNT(*) c FROM exercises WHERE source='custom'").get() as any).c).toBe(0);
    expect((mem.raw.prepare("SELECT COUNT(*) c FROM exercises WHERE source='seed'").get() as any).c).toBe(
      seed.ALL_SEED_EXERCISES.length
    );
  });
});

describe('machine seeds', () => {
  it('seeds machines with brand and load type on a fresh database', () => {
    expect(seed.EXERCISE_SEED_VERSION).toBe(3);
    expect(rowOf('life-fitness-chest-press')).toMatchObject({
      brand: 'Life Fitness',
      load_type: 'stack',
      source: 'seed',
      synced_at: null,
    });
    expect(rowOf('barbell-bench-press').brand).toBeNull();
  });

  it('upgrading from version 2 inserts the machines and hides nothing seeded', async () => {
    mem.raw.prepare("DELETE FROM exercises WHERE brand IS NOT NULL AND source = 'seed'").run();
    mem.raw.prepare('UPDATE app_meta SET value = ? WHERE key = ?').run('2', seed.EXERCISE_SEED_VERSION_KEY);
    await seed.seedExercises(mem);
    expect((mem.raw.prepare("SELECT COUNT(*) c FROM exercises WHERE source='seed' AND hidden=0").get() as any).c).toBe(
      seed.ALL_SEED_EXERCISES.length
    );
  });

  it('leaves a same-named custom exercise alone and keeps seed brands out of the brand list', async () => {
    const c = await lib.createCustomExercise(input({ brand: 'Life Fitness' }));
    mem.raw.prepare('UPDATE app_meta SET value = ? WHERE key = ?').run('2', seed.EXERCISE_SEED_VERSION_KEY);
    await seed.seedExercises(mem);
    expect(rowOf(c.id)).toMatchObject({ source: 'custom', hidden: 0, brand: 'Life Fitness' });
    expect(await lib.getCustomExerciseBrands()).toEqual(['Life Fitness']);
    expect(await w.getUnsyncedCustomExercises()).toHaveLength(1);
  });

  it('hides a dropped machine id and keeps its name on past workouts', async () => {
    const now = '2026-01-01T00:00:00.000Z';
    mem.raw
      .prepare(
        `INSERT INTO exercises (id, name, log_type, primary_muscles, secondary_muscles, equipment, brand, per_side, source, hidden, created_at, updated_at)
         VALUES ('rogue-old-machine', 'Old machine', 'weight_reps', '["chest"]', '[]', 'machine', 'Rogue', 0, 'seed', 0, ?, ?)`
      )
      .run(now, now);
    mem.raw.prepare('UPDATE app_meta SET value = ? WHERE key = ?').run('2', seed.EXERCISE_SEED_VERSION_KEY);
    await seed.seedExercises(mem);
    expect(rowOf('rogue-old-machine').hidden).toBe(1);
    expect(await lib.getExerciseById('rogue-old-machine')).toMatchObject({ name: 'Old machine' });
  });
});

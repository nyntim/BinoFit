import { createMemoryDb } from '@/test-utils/sqlite-memory';

let mem: ReturnType<typeof createMemoryDb>;
let database: typeof import('@/lib/database');
let w: typeof import('@/lib/workouts/db');

function load() {
  jest.resetModules();
  const SQLite = require('expo-sqlite');
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  database = require('@/lib/database');
  w = require('@/lib/workouts/db');
}

beforeEach(async () => {
  mem = createMemoryDb();
  load();
  await database.getDatabase();
});

const T = '2026-06-01T00:00:00.000Z';
const insertExercise = (id: string, source = 'custom', name = `Ex ${id}`) =>
  mem.raw
    .prepare(
      `INSERT INTO exercises (id,name,log_type,equipment,source,created_at,updated_at)
       VALUES (?,?,'weight_reps','barbell',?,?,?)`
    )
    .run(id, name, source, T, T);
const count = (table: string, where = '1=1'): number =>
  (mem.raw.prepare(`SELECT COUNT(*) c FROM ${table} WHERE ${where}`).get() as any).c;
const rowOf = (table: string, id: string): any => mem.raw.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);

/** A workout with one exercise and one set. */
async function tree(status: 'draft' | 'active' | 'done', exerciseId = 'ex1') {
  const workout = await w.createWorkout({ date: '2026-06-01', status });
  const link = await w.addWorkoutExercise({ workout_id: workout.id, exercise_id: exerciseId });
  const set = await w.addWorkoutSet({ workout_exercise_id: link.id, weight_kg: 50, reps: 5 });
  return { workout, link, set };
}

describe('workout schema', () => {
  it('initSchema creates the workout tables and keeps existing data on an old database', async () => {
    mem.raw
      .prepare(`INSERT INTO foods (id,name,serving_units,calories,protein,carbs,fat,source,updated_at) VALUES ('f1','Egg','1',70,6,0,5,'custom','x')`)
      .run();
    // Simulate a database created before the workout tables existed.
    mem.raw.exec(
      'DROP TABLE routine_exercises; DROP TABLE routines; DROP TABLE workout_sets; DROP TABLE workout_exercises; DROP TABLE workouts; DROP TABLE exercises; DROP TABLE app_meta;'
    );
    load();
    await database.getDatabase();
    const tables = (mem.raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]).map((r) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining([
        'app_meta',
        'exercises',
        'workouts',
        'workout_exercises',
        'workout_sets',
        'routines',
        'routine_exercises',
      ])
    );
    expect(count('foods', "id = 'f1'")).toBe(1);
  });

  it('running initSchema again on an up-to-date database is harmless', async () => {
    insertExercise('ex1');
    load();
    await database.getDatabase();
    expect(count('exercises', "source = 'custom'")).toBe(1);
    expect(count('exercises', "source = 'seed'")).toBe(49);
  });

  it('adds the rir column to an existing workout_sets table, keeping rows and RPE', async () => {
    mem.raw.exec(
      `DROP TABLE workout_sets;
       CREATE TABLE workout_sets (
         id TEXT PRIMARY KEY, workout_id TEXT NOT NULL, workout_exercise_id TEXT NOT NULL,
         position INTEGER NOT NULL, set_type TEXT NOT NULL DEFAULT 'normal', weight_kg REAL, reps INTEGER,
         duration_seconds INTEGER, distance_m REAL, rpe REAL, completed_at TEXT,
         created_at TEXT NOT NULL, updated_at TEXT NOT NULL, synced_at TEXT, deleted_at TEXT);`
    );
    mem.raw
      .prepare(`INSERT INTO workout_sets (id,workout_id,workout_exercise_id,position,rpe,created_at,updated_at) VALUES ('old','w','we',0,8,?,?)`)
      .run(T, T);
    load();
    await database.getDatabase();
    expect(rowOf('workout_sets', 'old')).toMatchObject({ rpe: 8, rir: null });
    // Running the schema again on an up-to-date table is safe.
    load();
    await database.getDatabase();
    expect(rowOf('workout_sets', 'old')).toMatchObject({ rpe: 8, rir: null });
  });

  it('buildWorkoutSetRow defaults rir to null and updateWorkoutSet persists and clears it', async () => {
    insertExercise('ex1');
    expect(w.buildWorkoutSetRow({ workout_exercise_id: 'we' }, 'w', 0).rir).toBeNull();
    const { set } = await tree('done');
    mem.raw.prepare('UPDATE workout_sets SET synced_at = ? WHERE id = ?').run(T, set.id);
    await w.updateWorkoutSet(set.id, { rir: 2 });
    expect(rowOf('workout_sets', set.id)).toMatchObject({ rir: 2, synced_at: null });
    await w.updateWorkoutSet(set.id, { rir: null });
    expect(rowOf('workout_sets', set.id).rir).toBeNull();
  });

  it('every workout table has the sync columns', () => {
    for (const t of [
      'exercises',
      'workouts',
      'workout_exercises',
      'workout_sets',
      'routines',
      'routine_exercises',
    ]) {
      const cols = (mem.raw.prepare(`PRAGMA table_info(${t})`).all() as any[]).map((c) => c.name);
      expect(cols).toEqual(expect.arrayContaining(['created_at', 'updated_at', 'synced_at', 'deleted_at']));
    }
  });
});

describe('one active workout at a time', () => {
  it('a second active workout throws ActiveWorkoutExistsError', async () => {
    await w.createWorkout({ date: '2026-06-01', status: 'active' });
    await expect(w.createWorkout({ date: '2026-06-02', status: 'active' })).rejects.toBeInstanceOf(
      w.ActiveWorkoutExistsError
    );
    expect(count('workouts')).toBe(1);
  });

  it('draft and done workouts are unlimited next to an active one', async () => {
    await w.createWorkout({ date: '2026-06-01', status: 'active' });
    await w.createWorkout({ date: '2026-06-01' });
    await w.createWorkout({ date: '2026-06-01', status: 'done' });
    await w.createWorkout({ date: '2026-06-01', status: 'done' });
    expect(count('workouts')).toBe(4);
  });

  it('promoting a draft to active while one is active throws ActiveWorkoutExistsError', async () => {
    await w.createWorkout({ date: '2026-06-01', status: 'active' });
    const draft = await w.createWorkout({ date: '2026-06-01' });
    await expect(w.updateWorkout(draft.id, { status: 'active' })).rejects.toBeInstanceOf(w.ActiveWorkoutExistsError);
    expect(rowOf('workouts', draft.id).status).toBe('draft');
  });

  it('finishing the active workout frees the slot', async () => {
    const a = await w.createWorkout({ date: '2026-06-01', status: 'active' });
    await w.updateWorkout(a.id, { status: 'done' });
    await expect(w.createWorkout({ date: '2026-06-02', status: 'active' })).resolves.toMatchObject({ status: 'active' });
  });

  it('getActiveWorkout returns the active workout or null', async () => {
    expect(await w.getActiveWorkout()).toBeNull();
    const a = await w.createWorkout({ date: '2026-06-01', status: 'active' });
    expect((await w.getActiveWorkout())?.id).toBe(a.id);
  });
});

describe('workout CRUD', () => {
  it('createWorkout defaults to a draft with source live', async () => {
    const d = await w.createWorkout({ date: '2026-06-01' });
    expect(d).toMatchObject({ status: 'draft', source: 'live', synced_at: null, deleted_at: null });
  });

  it('updateWorkout bumps updated_at and clears synced_at', async () => {
    const d = await w.createWorkout({ date: '2026-06-01', status: 'done' });
    mem.raw.prepare("UPDATE workouts SET synced_at = ?, updated_at = ? WHERE id = ?").run(T, T, d.id);
    const u = await w.updateWorkout(d.id, { name: 'Legs' });
    expect(u?.name).toBe('Legs');
    expect(u?.synced_at).toBeNull();
    expect(u!.updated_at > T).toBe(true);
  });

  it('addWorkoutExercise appends at the next position and never reuses a removed position', async () => {
    const d = await w.createWorkout({ date: '2026-06-01' });
    const a = await w.addWorkoutExercise({ workout_id: d.id, exercise_id: 'ex1' });
    const b = await w.addWorkoutExercise({ workout_id: d.id, exercise_id: 'ex1' });
    await w.removeWorkoutExercise(b.id);
    const c = await w.addWorkoutExercise({ workout_id: d.id, exercise_id: 'ex1' });
    expect([a.position, b.position, c.position]).toEqual([0, 1, 1]);
  });

  it('addWorkoutSet appends positions and takes workout_id from the exercise row', async () => {
    const { workout, link } = await tree('draft');
    const s2 = await w.addWorkoutSet({ workout_exercise_id: link.id });
    expect(s2).toMatchObject({ position: 1, workout_id: workout.id, set_type: 'normal' });
  });

  it('addWorkoutSet rejects an unknown workout exercise', async () => {
    await expect(w.addWorkoutSet({ workout_exercise_id: 'nope' })).rejects.toThrow('Workout exercise not found');
  });

  it('updateWorkoutSet patches values and clears synced_at', async () => {
    const { set } = await tree('done');
    mem.raw.prepare('UPDATE workout_sets SET synced_at = ? WHERE id = ?').run(T, set.id);
    await w.updateWorkoutSet(set.id, { reps: 8 });
    expect(rowOf('workout_sets', set.id)).toMatchObject({ reps: 8, weight_kg: 50, synced_at: null });
  });

  it('updateWorkoutSet cannot revive a tombstoned set', async () => {
    const { set } = await tree('done');
    await w.deleteWorkoutSet(set.id);
    await w.updateWorkoutSet(set.id, { reps: 99 });
    expect(rowOf('workout_sets', set.id).reps).toBe(5);
  });

  it('parseMuscles tolerates null, junk and non-arrays', () => {
    expect(w.parseMuscles(null)).toEqual([]);
    expect(w.parseMuscles('not json')).toEqual([]);
    expect(w.parseMuscles('{"a":1}')).toEqual([]);
    expect(w.parseMuscles('["chest",3,"triceps"]')).toEqual(['chest', 'triceps']);
  });
});

describe('getWorkoutWithExercises', () => {
  it('joins exercise names, orders by position and nests sets', async () => {
    insertExercise('ex1', 'custom', 'Bench');
    insertExercise('ex2', 'custom', 'Squat');
    const d = await w.createWorkout({ date: '2026-06-01' });
    const l1 = await w.addWorkoutExercise({ workout_id: d.id, exercise_id: 'ex2' });
    await w.addWorkoutExercise({ workout_id: d.id, exercise_id: 'ex1' });
    await w.addWorkoutSet({ workout_exercise_id: l1.id, reps: 3 });
    const full = await w.getWorkoutWithExercises(d.id);
    expect(full?.exercises.map((e) => e.exercise_name)).toEqual(['Squat', 'Bench']);
    expect(full?.exercises[0].sets).toHaveLength(1);
    expect(full?.exercises[0].exercise?.primary_muscles).toEqual([]);
  });

  it('shows "Unknown exercise" when the definition is missing', async () => {
    const { workout } = await tree('draft', 'ghost');
    const full = await w.getWorkoutWithExercises(workout.id);
    expect(full?.exercises[0]).toMatchObject({ exercise: null, exercise_name: 'Unknown exercise' });
    expect(w.UNKNOWN_EXERCISE_NAME).toBe('Unknown exercise');
  });

  it('keeps the name of a tombstoned custom exercise', async () => {
    insertExercise('ex1', 'custom', 'Bench');
    const { workout } = await tree('done');
    mem.raw.prepare('UPDATE exercises SET deleted_at = ? WHERE id = ?').run(T, 'ex1');
    const full = await w.getWorkoutWithExercises(workout.id);
    expect(full?.exercises[0].exercise_name).toBe('Bench');
  });

  it('returns null for a missing or deleted workout and hides tombstoned children', async () => {
    expect(await w.getWorkoutWithExercises('nope')).toBeNull();
    const { workout, link } = await tree('done');
    await w.removeWorkoutExercise(link.id);
    expect((await w.getWorkoutWithExercises(workout.id))?.exercises).toEqual([]);
    await w.deleteWorkout(workout.id);
    expect(await w.getWorkoutWithExercises(workout.id)).toBeNull();
    expect(await w.getWorkout(workout.id)).toBeNull();
  });
});

describe('deleting', () => {
  it('deleting a done workout tombstones the workout, its exercises and its sets', async () => {
    const { workout, link, set } = await tree('done');
    await w.deleteWorkout(workout.id);
    for (const [t, id] of [['workouts', workout.id], ['workout_exercises', link.id], ['workout_sets', set.id]]) {
      expect(rowOf(t, id)).toMatchObject({ synced_at: null });
      expect(rowOf(t, id).deleted_at).not.toBeNull();
    }
  });

  it('deleting a draft workout hard-deletes the whole tree', async () => {
    const { workout } = await tree('draft');
    await w.deleteWorkout(workout.id);
    expect(count('workouts') + count('workout_exercises') + count('workout_sets')).toBe(0);
  });

  it('deleting an active workout hard-deletes the whole tree', async () => {
    const { workout } = await tree('active');
    await w.deleteWorkout(workout.id);
    expect(count('workouts') + count('workout_exercises') + count('workout_sets')).toBe(0);
  });

  it('discardWorkout refuses a done workout and leaves it intact', async () => {
    const { workout } = await tree('done');
    await expect(w.discardWorkout(workout.id)).rejects.toThrow();
    expect(rowOf('workouts', workout.id)).toBeDefined();
    expect(count('workout_sets')).toBe(1);
  });

  it('updateWorkout rejects reopening a done workout', async () => {
    const { workout } = await tree('done');
    await expect(w.updateWorkout(workout.id, { status: 'draft' })).rejects.toThrow();
    await expect(w.updateWorkout(workout.id, { status: 'active' })).rejects.toThrow();
    expect(rowOf('workouts', workout.id).status).toBe('done');
  });

  it('discardWorkout leaves other workouts alone', async () => {
    const a = await tree('draft');
    const b = await tree('done');
    await w.discardWorkout(a.workout.id);
    expect(count('workouts')).toBe(1);
    expect(rowOf('workouts', b.workout.id)).toBeDefined();
    expect(count('workout_sets')).toBe(1);
  });

  it('deleting a missing workout is a no-op', async () => {
    await expect(w.deleteWorkout('nope')).resolves.toBeUndefined();
  });

  it('removing an exercise from a draft hard-deletes it and its sets', async () => {
    const { link } = await tree('draft');
    await w.removeWorkoutExercise(link.id);
    expect(count('workout_exercises') + count('workout_sets')).toBe(0);
  });

  it('removing an exercise from a done workout tombstones it and its sets', async () => {
    const { link, set } = await tree('done');
    await w.removeWorkoutExercise(link.id);
    expect(rowOf('workout_exercises', link.id).deleted_at).not.toBeNull();
    expect(rowOf('workout_sets', set.id).deleted_at).not.toBeNull();
  });

  it('deleting a set hard-deletes in a draft and tombstones in a done workout', async () => {
    const d = await tree('draft');
    await w.deleteWorkoutSet(d.set.id);
    expect(rowOf('workout_sets', d.set.id)).toBeUndefined();
    const n = await tree('done');
    await w.deleteWorkoutSet(n.set.id);
    expect(rowOf('workout_sets', n.set.id).deleted_at).not.toBeNull();
  });
});

describe('unsynced reads', () => {
  it('only done workouts and their children are unsynced; active and draft trees never are', async () => {
    const done = await tree('done');
    await tree('draft');
    await tree('active');
    const snap = await w.getUnsyncedWorkoutTree();
    expect(snap.workouts.map((x) => x.id)).toEqual([done.workout.id]);
    expect(snap.workoutExercises.map((x) => x.id)).toEqual([done.link.id]);
    expect(snap.sets.map((x) => x.id)).toEqual([done.set.id]);
  });

  it('finishing a draft makes its tree unsynced', async () => {
    const d = await tree('draft');
    expect((await w.getUnsyncedWorkouts())).toHaveLength(0);
    await w.updateWorkout(d.workout.id, { status: 'done' });
    expect((await w.getUnsyncedWorkoutSets()).map((s) => s.id)).toEqual([d.set.id]);
  });

  it('only custom exercises are unsynced, tombstones included; seeds never', async () => {
    insertExercise('c1', 'custom');
    insertExercise('s1', 'seed');
    mem.raw.prepare("UPDATE exercises SET deleted_at = ? WHERE id = 'c1'").run(T);
    expect((await w.getUnsyncedCustomExercises()).map((e) => e.id)).toEqual(['c1']);
  });

  it('a child tombstone is unsynced even when its parent workout is gone', async () => {
    const { link, set } = await tree('done');
    mem.raw.prepare("DELETE FROM workouts").run();
    mem.raw.prepare("UPDATE workout_exercises SET deleted_at = ? WHERE id = ?").run(T, link.id);
    expect((await w.getUnsyncedWorkoutExercises()).map((x) => x.id)).toEqual([link.id]);
    expect(await w.getUnsyncedWorkoutSets()).toEqual([]);
    mem.raw.prepare("UPDATE workout_sets SET deleted_at = ? WHERE id = ?").run(T, set.id);
    expect((await w.getUnsyncedWorkoutSets()).map((x) => x.id)).toEqual([set.id]);
  });

  it('a live child of a non-done workout is not unsynced', async () => {
    await tree('draft');
    expect(await w.getUnsyncedWorkoutExercises()).toEqual([]);
  });
});

describe('purgeSyncedExerciseTombstones', () => {
  const tombstone = (id: string, synced: string | null) =>
    mem.raw.prepare('UPDATE exercises SET deleted_at = ?, synced_at = ? WHERE id = ?').run(T, synced, id);

  it('removes synced tombstones nothing references', async () => {
    insertExercise('gone');
    tombstone('gone', T);
    await w.purgeSyncedExerciseTombstones();
    expect(rowOf('exercises', 'gone')).toBeUndefined();
  });

  it('keeps a synced tombstone that a workout exercise still references', async () => {
    insertExercise('used');
    await tree('done', 'used');
    tombstone('used', T);
    await w.purgeSyncedExerciseTombstones();
    expect(rowOf('exercises', 'used')).toBeDefined();
  });

  it('keeps unsynced tombstones and live exercises', async () => {
    insertExercise('unsynced');
    insertExercise('live');
    tombstone('unsynced', null);
    await w.purgeSyncedExerciseTombstones();
    expect(rowOf('exercises', 'unsynced')).toBeDefined();
    expect(rowOf('exercises', 'live')).toBeDefined();
  });
});

describe('wipe', () => {
  it('clearUserData keeps seed exercises and removes custom exercises, workouts and routines', async () => {
    insertExercise('seed1', 'seed');
    insertExercise('ex1', 'custom');
    await tree('done');
    await tree('draft');
    mem.raw
      .prepare("INSERT INTO routines (id,name,position,created_at,updated_at) VALUES ('r1','R',0,?,?)")
      .run(T, T);
    mem.raw
      .prepare(
        "INSERT INTO routine_exercises (id,routine_id,exercise_id,position,set_count,rest_seconds,created_at,updated_at) VALUES ('re1','r1','ex1',0,2,90,?,?)"
      )
      .run(T, T);
    await database.clearUserData();
    expect(count('exercises', "source = 'custom'")).toBe(0);
    expect(count('exercises', "source = 'seed'")).toBe(50);
    expect(rowOf('exercises', 'seed1')).toBeDefined();
    expect(
      count('workouts') +
        count('workout_exercises') +
        count('workout_sets') +
        count('routines') +
        count('routine_exercises')
    ).toBe(0);
  });

  it('markAllUnsynced clears synced_at on workout and routine tables', async () => {
    insertExercise('ex1');
    const { workout, link, set } = await tree('done');
    mem.raw
      .prepare("INSERT INTO routines (id,name,position,created_at,updated_at) VALUES ('r1','R',0,?,?)")
      .run(T, T);
    mem.raw
      .prepare(
        "INSERT INTO routine_exercises (id,routine_id,exercise_id,position,set_count,rest_seconds,created_at,updated_at) VALUES ('re1','r1','ex1',0,2,90,?,?)"
      )
      .run(T, T);
    for (const [t, id] of [
      ['exercises', 'ex1'],
      ['workouts', workout.id],
      ['workout_exercises', link.id],
      ['workout_sets', set.id],
      ['routines', 'r1'],
      ['routine_exercises', 're1'],
    ]) {
      mem.raw.prepare(`UPDATE ${t} SET synced_at = ? WHERE id = ?`).run(T, id);
    }
    await database.markAllUnsynced();
    for (const t of [
      'exercises',
      'workouts',
      'workout_exercises',
      'workout_sets',
      'routines',
      'routine_exercises',
    ]) {
      expect(count(t, 'synced_at IS NOT NULL')).toBe(0);
    }
  });
});

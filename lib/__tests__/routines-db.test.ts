import { createMemoryDb } from '@/test-utils/sqlite-memory';

let mem: ReturnType<typeof createMemoryDb>;
let database: typeof import('@/lib/database');
let w: typeof import('@/lib/workouts/db');
let routines: typeof import('@/lib/workouts/routines');
let drafts: typeof import('@/lib/workouts/drafts');
let prefs: typeof import('@/lib/app-preferences');
let activeStore: typeof import('@/lib/workouts/active-workout-store');

function load() {
  jest.resetModules();
  const SQLite = require('expo-sqlite');
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  database = require('@/lib/database');
  w = require('@/lib/workouts/db');
  routines = require('@/lib/workouts/routines');
  drafts = require('@/lib/workouts/drafts');
  prefs = require('@/lib/app-preferences');
  activeStore = require('@/lib/workouts/active-workout-store');
}

beforeEach(async () => {
  mem = createMemoryDb();
  load();
  await database.getDatabase();
  activeStore.setActiveWorkout(null);
});

const T = '2026-06-01T00:00:00.000Z';
const insertExercise = (
  id: string,
  source = 'custom',
  name = `Ex ${id}`,
  defaultRest: number | null = null
) =>
  mem.raw
    .prepare(
      `INSERT INTO exercises (id,name,log_type,equipment,default_rest_seconds,source,created_at,updated_at)
       VALUES (?,?,'weight_reps','barbell',?,?,?,?)`
    )
    .run(id, name, defaultRest, source, T, T);

const count = (table: string, where = '1=1'): number =>
  (mem.raw.prepare(`SELECT COUNT(*) c FROM ${table} WHERE ${where}`).get() as any).c;
const rowOf = (table: string, id: string): any =>
  mem.raw.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);

describe('routine schema and migration', () => {
  it('initWorkoutSchema creates routines and routine_exercises on an older database and a second launch keeps rows', async () => {
    mem.raw.exec('DROP TABLE routine_exercises; DROP TABLE routines;');
    load();
    await database.getDatabase();
    const r = await routines.createRoutine('Upper');
    load();
    await database.getDatabase();
    const list = await routines.getRoutines();
    expect(list.map((x) => x.id)).toEqual([r.id]);
    expect(list[0].name).toBe('Upper');
  });
});

describe('routine CRUD', () => {
  it('creates routines at the end, renames, reorders, and hides tombstones', async () => {
    const a = await routines.createRoutine('Push');
    const b = await routines.createRoutine('   ');
    const c = await routines.createRoutine('Legs');
    expect([a.position, b.position, c.position]).toEqual([0, 1, 2]);
    expect(b.name).toBe('Routine');

    const renamed = await routines.renameRoutine(b.id, '  Pull  ');
    expect(renamed?.name).toBe('Pull');
    expect(renamed?.synced_at).toBeNull();

    await routines.reorderRoutines([c.id, a.id, b.id]);
    const reordered = await routines.getRoutines();
    expect(reordered.map((r) => [r.name, r.position])).toEqual([
      ['Legs', 0],
      ['Push', 1],
      ['Pull', 2],
    ]);

    await routines.deleteRoutine(a.id);
    const afterDelete = await routines.getRoutines();
    expect(afterDelete.map((r) => r.id)).toEqual([c.id, b.id]);
    const d = await routines.createRoutine('Arms');
    expect(d.position).toBe(3);
  });

  it('adds exercises with default set count and resolved rest, updates set count and rest, and removes a single child', async () => {
    insertExercise('ex1', 'custom', 'Bench', 120);
    insertExercise('ex2', 'custom', 'Row', null);
    prefs.setDefaultSetCount(4);

    // Log a past workout with rest 150 on ex2 so getLastRestSeconds resolves to 150.
    const done = await w.createWorkout({ date: '2026-06-01', status: 'done' });
    await w.addWorkoutExercise({ workout_id: done.id, exercise_id: 'ex2', rest_seconds: 150 });

    const r = await routines.createRoutine('Full Body');
    const e1 = await routines.addExerciseToRoutine(r.id, 'ex1');
    const e2 = await routines.addExerciseToRoutine(r.id, 'ex2');

    expect(e1).toMatchObject({ set_count: 4, rest_seconds: 120, position: 0 });
    expect(e2).toMatchObject({ set_count: 4, rest_seconds: 150, position: 1 });

    await routines.updateRoutineExerciseSetCount(e1.id, 15);
    await routines.updateRoutineExerciseRest(e1.id, 0);
    const loaded = await routines.getRoutineWithExercises(r.id);
    expect(loaded?.exercises[0]).toMatchObject({ set_count: 10, rest_seconds: 0 });

    await routines.removeRoutineExercise(e1.id);
    expect(rowOf('routine_exercises', e1.id).deleted_at).not.toBeNull();
    const afterRemove = await routines.getRoutineWithExercises(r.id);
    expect(afterRemove?.exercises.map((x) => x.id)).toEqual([e2.id]);
  });

  it('keeps a tombstoned custom exercise name and falls back to Unknown exercise when missing', async () => {
    insertExercise('ex1', 'custom', 'Cable Fly');
    const r = await routines.createRoutine('Chest');
    await routines.addExerciseToRoutine(r.id, 'ex1');
    await routines.addExerciseToRoutine(r.id, 'missing-ex');
    mem.raw.prepare('UPDATE exercises SET deleted_at = ? WHERE id = ?').run(T, 'ex1');

    const full = await routines.getRoutineWithExercises(r.id);
    expect(full?.exercises.map((e) => e.exercise_name)).toEqual(['Cable Fly', 'Unknown exercise']);
  });

  it('deleting a routine tombstones the routine and its children and hides it from reads', async () => {
    insertExercise('ex1');
    const r = await routines.createRoutine('Push');
    const child = await routines.addExerciseToRoutine(r.id, 'ex1');
    mem.raw.prepare('UPDATE routines SET synced_at = ? WHERE id = ?').run(T, r.id);
    mem.raw.prepare('UPDATE routine_exercises SET synced_at = ? WHERE id = ?').run(T, child.id);

    await routines.deleteRoutine(r.id);

    expect(rowOf('routines', r.id)).toMatchObject({
      synced_at: null,
      deleted_at: expect.any(String),
    });
    expect(rowOf('routine_exercises', child.id)).toMatchObject({
      synced_at: null,
      deleted_at: expect.any(String),
    });
    expect(await routines.getRoutine(r.id)).toBeNull();
    expect(await routines.getRoutineWithExercises(r.id)).toBeNull();
    expect(await routines.getRoutines()).toEqual([]);
  });
});

describe('saveWorkoutAsRoutine', () => {
  it('copies exercise order, clamped set counts and rest without modifying source workout routine_id, and allows a second save', async () => {
    insertExercise('ex1', 'custom', 'Squat', 180);
    insertExercise('ex2', 'custom', 'Lunge', 60);
    insertExercise('ex3', 'custom', 'Empty Ex', 90);

    const workout = await w.createWorkout({
      date: '2026-06-01',
      status: 'done',
      name: '  Leg Day  ',
    });
    const l1 = await w.addWorkoutExercise({
      workout_id: workout.id,
      exercise_id: 'ex1',
      rest_seconds: null,
    });
    for (let i = 0; i < 12; i++) {
      await w.addWorkoutSet({ workout_exercise_id: l1.id, weight_kg: 100, reps: 5 });
    }
    const l2 = await w.addWorkoutExercise({
      workout_id: workout.id,
      exercise_id: 'ex2',
      rest_seconds: 0,
    });
    await w.addWorkoutSet({ workout_exercise_id: l2.id, weight_kg: 40, reps: 10 });
    // l3 has 0 sets and should be skipped
    await w.addWorkoutExercise({ workout_id: workout.id, exercise_id: 'ex3', rest_seconds: 90 });

    const saved1 = await routines.saveWorkoutAsRoutine(workout.id);
    expect(saved1?.name).toBe('Leg Day');
    expect(saved1?.exercises.map((e) => [e.exercise_id, e.set_count, e.rest_seconds])).toEqual([
      ['ex1', 10, 180],
      ['ex2', 1, 0],
    ]);
    expect(rowOf('workouts', workout.id).routine_id).toBeNull();

    const saved2 = await routines.saveWorkoutAsRoutine(workout.id);
    expect(saved2?.id).not.toBe(saved1?.id);
    expect(await routines.getRoutines()).toHaveLength(2);
  });

  it('saves nothing when a workout has no sets', async () => {
    insertExercise('ex1');
    const workout = await w.createWorkout({ date: '2026-06-01', status: 'done' });
    await w.addWorkoutExercise({ workout_id: workout.id, exercise_id: 'ex1' });
    expect(await routines.saveWorkoutAsRoutine(workout.id)).toBeNull();
    expect(count('routines')).toBe(0);
  });
});

describe('starting from a routine', () => {
  it('live start creates an active live workout with routine_id, name, rest (including 0), and previous or planned sets', async () => {
    insertExercise('ex1', 'custom', 'Bench');
    insertExercise('ex2', 'custom', 'Curl');

    // Done workout with previous sets for ex1
    const prev = await w.createWorkout({
      date: '2026-06-01',
      status: 'done',
      started_at: '2026-06-01T09:00:00.000Z',
    });
    const prevLink = await w.addWorkoutExercise({ workout_id: prev.id, exercise_id: 'ex1' });
    await w.addWorkoutSet({
      workout_exercise_id: prevLink.id,
      weight_kg: 82.5,
      reps: 6,
      rpe: 8.5,
      completed_at: '2026-06-01T09:10:00.000Z',
    });

    const r = await routines.createRoutine('Push Routine');
    const re1 = await routines.addExerciseToRoutine(r.id, 'ex1');
    const re2 = await routines.addExerciseToRoutine(r.id, 'ex2');
    await routines.updateRoutineExerciseSetCount(re1.id, 5);
    await routines.updateRoutineExerciseRest(re1.id, 0);
    await routines.updateRoutineExerciseSetCount(re2.id, 3);
    await routines.updateRoutineExerciseRest(re2.id, 120);

    const now = new Date('2026-06-02T10:00:00.000Z');
    const started = await routines.startLiveFromRoutine(r.id, now);
    expect(typeof started).toBe('object');
    if (typeof started !== 'object') throw new Error('expected workout');

    expect(started).toMatchObject({
      status: 'active',
      source: 'live',
      name: 'Push Routine',
      routine_id: r.id,
    });
    expect(activeStore.getActiveWorkoutState().workout?.id).toBe(started.id);

    const full = await w.getWorkoutWithExercises(started.id);
    expect(full?.exercises).toHaveLength(2);
    // ex1 had 1 previous set -> 1 prefilled unticked set (planned count 5 does not pad)
    expect(full?.exercises[0].rest_seconds).toBe(0);
    expect(full?.exercises[0].sets).toHaveLength(1);
    expect(full?.exercises[0].sets[0]).toMatchObject({
      weight_kg: 82.5,
      reps: 6,
      rpe: null,
      completed_at: null,
    });
    // ex2 had no previous sets -> 3 empty sets
    expect(full?.exercises[1].rest_seconds).toBe(120);
    expect(full?.exercises[1].sets).toHaveLength(3);
  });

  it('live start while a workout is already active returns "active" and inserts nothing', async () => {
    insertExercise('ex1');
    const r = await routines.createRoutine('Push');
    await routines.addExerciseToRoutine(r.id, 'ex1');

    const existing = await w.createWorkout({ date: '2026-06-01', status: 'active' });
    const res = await routines.startLiveFromRoutine(r.id, new Date('2026-06-02T10:00:00.000Z'));
    expect(res).toBe('active');
    expect(count('workouts')).toBe(1);
    expect(rowOf('workouts', existing.id)).toBeDefined();
  });

  it('draft start inserts a new manual draft and does not reuse an existing empty draft', async () => {
    insertExercise('ex1');
    const r = await routines.createRoutine('Pull');
    await routines.addExerciseToRoutine(r.id, 'ex1');

    const emptyDraft = await drafts.getOrCreateDraft(new Date('2026-06-02T08:00:00.000Z'));
    const started = await routines.startDraftFromRoutine(
      r.id,
      new Date('2026-06-02T10:00:00.000Z')
    );
    expect(typeof started).toBe('object');
    if (typeof started !== 'object') throw new Error('expected draft');

    expect(started.id).not.toBe(emptyDraft.id);
    expect(started).toMatchObject({
      status: 'draft',
      source: 'manual',
      name: 'Pull',
      routine_id: r.id,
      duration_seconds: 3600,
    });
    expect((await w.getWorkoutWithExercises(emptyDraft.id))?.exercises).toEqual([]);
    expect((await w.getWorkoutWithExercises(started.id))?.exercises).toHaveLength(1);
  });
});

describe('clearUserData and markAllUnsynced', () => {
  it('clearUserData removes routines and routine_exercises and leaves seed exercises', async () => {
    insertExercise('ex1');
    const r = await routines.createRoutine('Push');
    await routines.addExerciseToRoutine(r.id, 'ex1');
    await database.clearUserData();
    expect(count('routines') + count('routine_exercises')).toBe(0);
    expect(count('exercises', "source = 'seed'")).toBe(49);
  });

  it('markAllUnsynced clears synced_at on routines and routine_exercises', async () => {
    insertExercise('ex1');
    const r = await routines.createRoutine('Push');
    const c = await routines.addExerciseToRoutine(r.id, 'ex1');
    mem.raw.prepare('UPDATE routines SET synced_at = ? WHERE id = ?').run(T, r.id);
    mem.raw.prepare('UPDATE routine_exercises SET synced_at = ? WHERE id = ?').run(T, c.id);
    await database.markAllUnsynced();
    expect(rowOf('routines', r.id).synced_at).toBeNull();
    expect(rowOf('routine_exercises', c.id).synced_at).toBeNull();
  });
});

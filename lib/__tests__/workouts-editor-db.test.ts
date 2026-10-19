import { createMemoryDb } from '@/test-utils/sqlite-memory';

let mem: ReturnType<typeof createMemoryDb>;
let database: typeof import('@/lib/database');
let w: typeof import('@/lib/workouts/db');
let drafts: typeof import('@/lib/workouts/drafts');
let prev: typeof import('@/lib/workouts/previous');
let store: typeof import('@/lib/workouts/active-workout-store');

beforeEach(async () => {
  mem = createMemoryDb();
  jest.resetModules();
  const SQLite = require('expo-sqlite');
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  database = require('@/lib/database');
  w = require('@/lib/workouts/db');
  drafts = require('@/lib/workouts/drafts');
  prev = require('@/lib/workouts/previous');
  store = require('@/lib/workouts/active-workout-store');
  await database.getDatabase();
});

const T = '2026-06-01T00:00:00.000Z';
const addExercise = (id: string, rest: number | null = null) =>
  mem.raw
    .prepare(
      `INSERT INTO exercises (id,name,log_type,equipment,default_rest_seconds,source,created_at,updated_at)
       VALUES (?,?,'weight_reps','barbell',?,'custom',?,?)`
    )
    .run(id, `Ex ${id}`, rest, T, T);
const count = (table: string, where = '1=1'): number =>
  (mem.raw.prepare(`SELECT COUNT(*) c FROM ${table} WHERE ${where}`).get() as any).c;
const rowOf = (table: string, id: string): any => mem.raw.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);

async function doneWorkout(startedAt: string, exerciseId: string, sets: any[], rest: number | null = null) {
  const wo = await w.createWorkout({ date: startedAt.slice(0, 10), status: 'done', started_at: startedAt });
  const link = await w.addWorkoutExercise({ workout_id: wo.id, exercise_id: exerciseId, rest_seconds: rest });
  for (const s of sets) await w.addWorkoutSet({ workout_exercise_id: link.id, ...s });
  return { wo, link };
}

describe('previous performance and addExerciseToWorkout', () => {
  beforeEach(() => {
    addExercise('ex1', 75);
  });

  it('previous must be earlier and not this workout, latest first', async () => {
    const a = await doneWorkout('2026-06-10T10:00:00.000Z', 'ex1', [{ weight_kg: 10, reps: 1 }]);
    await doneWorkout('2026-06-12T10:00:00.000Z', 'ex1', [{ weight_kg: 20, reps: 2 }]);
    const later = await doneWorkout('2026-06-20T10:00:00.000Z', 'ex1', [{ weight_kg: 30, reps: 3 }]);
    const m = await prev.getPreviousPerformance(['ex1'], { excludeWorkoutId: later.wo.id, before: '2026-06-20T10:00:00.000Z' });
    expect(m.get('ex1')![0].weight_kg).toBe(20);
    const early = await prev.getPreviousPerformance(['ex1'], { before: '2026-06-11T00:00:00.000Z' });
    expect(early.get('ex1')![0].weight_kg).toBe(10);
    const none = await prev.getPreviousPerformance(['ex1'], { before: '2026-06-01T00:00:00.000Z' });
    expect(none.has('ex1')).toBe(false);
    const excl = await prev.getPreviousPerformance(['ex1'], { excludeWorkoutId: a.wo.id, before: '2026-06-11T00:00:00.000Z' });
    expect(excl.has('ex1')).toBe(false);
    expect((await prev.getPreviousPerformance([])).size).toBe(0);
  });

  it('ignores draft and active workouts as previous', async () => {
    const d = await w.createWorkout({ date: '2026-06-10', status: 'draft', started_at: '2026-06-10T10:00:00.000Z' });
    const l = await w.addWorkoutExercise({ workout_id: d.id, exercise_id: 'ex1' });
    await w.addWorkoutSet({ workout_exercise_id: l.id, weight_kg: 5, reps: 5 });
    expect((await prev.getPreviousPerformance(['ex1'], { before: '2026-07-01T00:00:00.000Z' })).size).toBe(0);
  });

  it('prefills sets in index order with types, no ticks or RPE, and the last rest', async () => {
    await doneWorkout(
      '2026-06-10T10:00:00.000Z',
      'ex1',
      [
        { set_type: 'warmup', weight_kg: 20, reps: 10, rpe: 6, completed_at: T },
        { weight_kg: 60, reps: 5, rpe: 9, completed_at: T },
      ],
      120
    );
    const draft = await w.createWorkout({ date: '2026-06-15', status: 'draft', started_at: '2026-06-15T10:00:00.000Z' });
    const link = await prev.addExerciseToWorkout(draft.id, 'ex1');
    expect(link.rest_seconds).toBe(120);
    const sets = mem.raw.prepare('SELECT * FROM workout_sets WHERE workout_exercise_id = ? ORDER BY position').all(link.id) as any[];
    expect(sets.map((s) => s.set_type)).toEqual(['warmup', 'normal']);
    expect(sets.map((s) => s.weight_kg)).toEqual([20, 60]);
    expect(sets.every((s) => s.rpe === null && s.completed_at === null)).toBe(true);
  });

  it('with no history adds two empty sets and the exercise default rest', async () => {
    const draft = await w.createWorkout({ date: '2026-06-15', status: 'draft' });
    const link = await prev.addExerciseToWorkout(draft.id, 'ex1');
    expect(link.rest_seconds).toBe(75);
    const sets = mem.raw.prepare('SELECT * FROM workout_sets WHERE workout_exercise_id = ?').all(link.id) as any[];
    expect(sets).toHaveLength(2);
    expect(sets.every((s) => s.weight_kg === null)).toBe(true);
  });

  it('with no history uses the default set count preference', async () => {
    const prefs = require('@/lib/app-preferences');
    await prefs.setDefaultSetCount(4);
    const draft = await w.createWorkout({ date: '2026-06-15', status: 'draft' });
    const link = await prev.addExerciseToWorkout(draft.id, 'ex1');
    const sets = mem.raw.prepare('SELECT * FROM workout_sets WHERE workout_exercise_id = ?').all(link.id) as any[];
    expect(sets).toHaveLength(4);
  });

  it('with one previous set pads to the default count without copying its values', async () => {
    const prefs = require('@/lib/app-preferences');
    await prefs.setDefaultSetCount(4);
    await doneWorkout('2026-06-10T10:00:00.000Z', 'ex1', [{ weight_kg: 50, reps: 5 }]);
    const draft = await w.createWorkout({ date: '2026-06-15', status: 'draft' });
    const link = await prev.addExerciseToWorkout(draft.id, 'ex1');
    const sets = mem.raw.prepare('SELECT * FROM workout_sets WHERE workout_exercise_id = ?').all(link.id) as any[];
    expect(sets).toHaveLength(4);
    expect(sets[0].weight_kg).toBe(50);
    expect(sets.slice(1).every((s) => s.weight_kg === null && s.reps === null)).toBe(true);
  });

  it('keeps all previous sets when there are more than the default', async () => {
    await doneWorkout('2026-06-10T10:00:00.000Z', 'ex1', [
      { weight_kg: 40, reps: 8 },
      { weight_kg: 50, reps: 6 },
      { weight_kg: 60, reps: 4 },
    ]);
    const draft = await w.createWorkout({ date: '2026-06-15', status: 'draft' });
    const link = await prev.addExerciseToWorkout(draft.id, 'ex1');
    const sets = mem.raw.prepare('SELECT * FROM workout_sets WHERE workout_exercise_id = ? ORDER BY position').all(link.id) as any[];
    expect(sets.map((s) => s.weight_kg)).toEqual([40, 50, 60]);
  });

  it('falls back to 90 s, and keeps a last rest of 0', async () => {
    addExercise('plain');
    const draft = await w.createWorkout({ date: '2026-06-15', status: 'draft' });
    expect((await prev.addExerciseToWorkout(draft.id, 'plain')).rest_seconds).toBe(90);
    await doneWorkout('2026-06-10T10:00:00.000Z', 'ex1', [{ weight_kg: 1, reps: 1 }], 0);
    expect((await prev.addExerciseToWorkout(draft.id, 'ex1')).rest_seconds).toBe(0);
  });

  it('is one transaction: a failing set insert leaves no exercise link', async () => {
    await doneWorkout('2026-06-10T10:00:00.000Z', 'ex1', [{ weight_kg: 1, reps: 1 }]);
    const draft = await w.createWorkout({ date: '2026-06-15', status: 'draft' });
    mem.raw.exec(`CREATE TRIGGER fail_set BEFORE INSERT ON workout_sets BEGIN SELECT RAISE(ABORT, 'nope'); END;`);
    await expect(prev.addExerciseToWorkout(draft.id, 'ex1')).rejects.toBeTruthy();
    expect(count('workout_exercises', `workout_id = '${draft.id}'`)).toBe(0);
  });

  it('throws for a missing workout', async () => {
    await expect(prev.addExerciseToWorkout('nope', 'ex1')).rejects.toThrow('Workout not found');
  });

  it('insert helpers honour client ids and updateWorkoutExercise edits the new row', async () => {
    const wo = await w.createWorkout({ date: '2026-06-15', status: 'draft' });
    const link = await w.addWorkoutExercise({ id: 'my-link', workout_id: wo.id, exercise_id: 'ex1' });
    const s = await w.addWorkoutSet({ id: 'my-set', workout_exercise_id: link.id });
    expect(link.id).toBe('my-link');
    expect(s.id).toBe('my-set');
    await w.updateWorkoutExercise('my-link', { rest_seconds: 45, notes: 'tempo' });
    expect(rowOf('workout_exercises', 'my-link')).toMatchObject({ rest_seconds: 45, notes: 'tempo' });
  });
});

describe('drafts', () => {
  const NOW = new Date('2026-10-17T12:00:00.000Z');

  it('creates a draft dated today with start now - 1 h and 1:00 duration', async () => {
    const d = await drafts.getOrCreateDraft(NOW);
    expect(d.status).toBe('draft');
    expect(d.source).toBe('manual');
    expect(d.duration_seconds).toBe(3600);
    expect(d.started_at).toBe('2026-10-17T11:00:00.000Z');
  });

  it('reuses the newest existing draft', async () => {
    const first = await drafts.getOrCreateDraft(NOW);
    const second = await drafts.getOrCreateDraft(new Date(NOW.getTime() + 60000));
    expect(second.id).toBe(first.id);
    expect(count('workouts')).toBe(1);
    mem.raw.prepare('UPDATE workouts SET created_at = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', first.id);
    const newer = await w.createWorkout({ date: '2026-10-17', status: 'draft' });
    expect((await drafts.getOrCreateDraft(NOW)).id).toBe(newer.id);
  });

  it('purges drafts idle for more than 7 days, keeps exactly 7 days', async () => {
    const mk = async (createdAt: string, startedAt: string) => {
      const d = await w.createWorkout({ date: '2026-10-01', status: 'draft', started_at: startedAt });
      mem.raw.prepare('UPDATE workouts SET created_at = ?, updated_at = ? WHERE id = ?').run(createdAt, createdAt, d.id);
      return d;
    };
    const old = await mk('2026-10-10T11:59:59.999Z', '2026-10-17T10:00:00.000Z');
    const edge = await mk('2026-10-10T12:00:00.000Z', '2020-01-01T00:00:00.000Z');
    const fresh = await mk('2026-10-16T00:00:00.000Z', '2020-01-01T00:00:00.000Z');
    const link = await w.addWorkoutExercise({ workout_id: old.id, exercise_id: 'x' });
    await w.addWorkoutSet({ workout_exercise_id: link.id });
    mem.raw.prepare('UPDATE workout_exercises SET updated_at = ?').run('2026-10-10T11:00:00.000Z');
    mem.raw.prepare('UPDATE workout_sets SET updated_at = ?').run('2026-10-10T11:00:00.000Z');
    const done = await w.createWorkout({ date: '2026-01-01', status: 'done' });
    mem.raw.prepare('UPDATE workouts SET created_at = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', done.id);

    expect(await drafts.purgeStaleDrafts(NOW)).toBe(1);
    expect(rowOf('workouts', old.id)).toBeUndefined();
    expect(count('workout_exercises', `workout_id = '${old.id}'`)).toBe(0);
    expect(count('workout_sets')).toBe(0);
    expect(rowOf('workouts', edge.id)).toBeDefined();
    expect(rowOf('workouts', fresh.id)).toBeDefined();
    expect(rowOf('workouts', done.id)).toBeDefined();
    expect(drafts.DRAFT_MAX_AGE_DAYS).toBe(7);
  });

  it('keeps an old draft that has recent activity on a child', async () => {
    const d = await w.createWorkout({ date: '2026-10-01', status: 'draft' });
    mem.raw.prepare('UPDATE workouts SET created_at = ?, updated_at = ? WHERE id = ?').run('2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', d.id);
    const link = await w.addWorkoutExercise({ workout_id: d.id, exercise_id: 'x' });
    mem.raw.prepare('UPDATE workout_exercises SET updated_at = ? WHERE id = ?').run('2026-09-01T00:00:00.000Z', link.id);
    const set = await w.addWorkoutSet({ workout_exercise_id: link.id });
    mem.raw.prepare('UPDATE workout_sets SET updated_at = ? WHERE id = ?').run('2026-10-16T00:00:00.000Z', set.id);
    expect(await drafts.purgeStaleDrafts(NOW)).toBe(0);
    expect(rowOf('workouts', d.id)).toBeDefined();
  });

  it('double getOrCreateDraft creates one draft', async () => {
    const [a, b] = await Promise.all([drafts.getOrCreateDraft(NOW), drafts.getOrCreateDraft(NOW)]);
    expect(a.id).toBe(b.id);
    expect(count('workouts')).toBe(1);
  });

  it('cancelDraft hard-deletes the draft and its children, leaves done workouts alone', async () => {
    const d = await drafts.getOrCreateDraft(NOW);
    const l = await w.addWorkoutExercise({ workout_id: d.id, exercise_id: 'x' });
    await w.addWorkoutSet({ workout_exercise_id: l.id, weight_kg: 1, reps: 1 });
    await drafts.cancelDraft(d.id);
    expect(count('workouts')).toBe(0);
    expect(count('workout_exercises')).toBe(0);
    expect(count('workout_sets')).toBe(0);
    const done = await w.createWorkout({ date: '2026-10-01', status: 'done' });
    await drafts.cancelDraft(done.id);
    await drafts.cancelDraft('missing');
    expect(rowOf('workouts', done.id).deleted_at).toBeNull();
  });

  it('saveDraft marks done, ticks filled sets, drops empties and sets ended_at', async () => {
    const d = await drafts.getOrCreateDraft(NOW);
    const l1 = await w.addWorkoutExercise({ workout_id: d.id, exercise_id: 'x' });
    const l2 = await w.addWorkoutExercise({ workout_id: d.id, exercise_id: 'y' });
    const s1 = await w.addWorkoutSet({ workout_exercise_id: l1.id, weight_kg: 50, reps: 5 });
    const s2 = await w.addWorkoutSet({ workout_exercise_id: l1.id });
    await w.addWorkoutSet({ workout_exercise_id: l2.id });
    expect(await drafts.saveDraft(d.id, NOW)).toBe('saved');
    expect(rowOf('workouts', d.id)).toMatchObject({ status: 'done', ended_at: '2026-10-17T12:00:00.000Z' });
    expect(rowOf('workout_sets', s1.id).completed_at).toBe('2026-10-17T12:00:00.000Z');
    expect(rowOf('workout_sets', s2.id)).toBeUndefined();
    expect(rowOf('workout_exercises', l2.id)).toBeUndefined();
    expect(rowOf('workout_exercises', l1.id)).toBeDefined();
  });

  it('saveDraft returns empty and changes nothing when no set has data', async () => {
    const d = await drafts.getOrCreateDraft(NOW);
    const l = await w.addWorkoutExercise({ workout_id: d.id, exercise_id: 'x' });
    await w.addWorkoutSet({ workout_exercise_id: l.id });
    expect(await drafts.saveDraft(d.id, NOW)).toBe('empty');
    expect(await drafts.saveDraft('missing', NOW)).toBe('empty');
    expect(rowOf('workouts', d.id).status).toBe('draft');
    expect(count('workout_sets')).toBe(1);
  });

  it('cleanupEmptyEntries tombstones empties in a done workout but never empties it entirely', async () => {
    const d = await w.createWorkout({ date: '2026-10-01', status: 'done' });
    const l1 = await w.addWorkoutExercise({ workout_id: d.id, exercise_id: 'x' });
    const l2 = await w.addWorkoutExercise({ workout_id: d.id, exercise_id: 'y' });
    const good = await w.addWorkoutSet({ workout_exercise_id: l1.id, weight_kg: 5, reps: 5 });
    const empty = await w.addWorkoutSet({ workout_exercise_id: l1.id });
    await w.addWorkoutSet({ workout_exercise_id: l2.id });
    await drafts.cleanupEmptyEntries(d.id, new Date());
    expect(rowOf('workout_sets', empty.id).deleted_at).not.toBeNull();
    expect(rowOf('workout_exercises', l2.id).deleted_at).not.toBeNull();
    expect(rowOf('workout_sets', good.id).deleted_at).toBeNull();
    expect(rowOf('workout_sets', good.id).completed_at).toBeNull();
    expect(rowOf('workouts', d.id).status).toBe('done');

    // A workout with nothing filled is left untouched.
    const d2 = await w.createWorkout({ date: '2026-10-02', status: 'done' });
    const m = await w.addWorkoutExercise({ workout_id: d2.id, exercise_id: 'x' });
    const e = await w.addWorkoutSet({ workout_exercise_id: m.id });
    await drafts.cleanupEmptyEntries(d2.id, new Date());
    expect(rowOf('workout_sets', e.id).deleted_at).toBeNull();
    expect(rowOf('workout_exercises', m.id).deleted_at).toBeNull();
    expect(rowOf('workouts', d2.id).deleted_at).toBeNull();
  });
});

describe('active workout store', () => {
  it('starts unloaded and notifies subscribers on set and refresh', async () => {
    store.resetActiveWorkoutStore();
    expect(store.getActiveWorkoutState()).toEqual({ workout: null, loaded: false });
    const listener = jest.fn();
    const unsub = store.subscribeActiveWorkout(listener);
    await store.refreshActiveWorkout();
    expect(store.getActiveWorkoutState()).toEqual({ workout: null, loaded: true });
    expect(listener).toHaveBeenCalledTimes(1);

    const active = await w.createWorkout({ date: '2026-10-17', status: 'active' });
    await store.refreshActiveWorkout();
    expect(store.getActiveWorkoutState().workout?.id).toBe(active.id);
    expect(listener).toHaveBeenCalledTimes(2);

    store.setActiveWorkout(null);
    expect(store.getActiveWorkoutState().workout).toBeNull();
    unsub();
    store.setActiveWorkout(null);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('a throwing listener does not stop others, and refresh never throws', async () => {
    store.resetActiveWorkoutStore();
    const good = jest.fn();
    store.subscribeActiveWorkout(() => { throw new Error('x'); });
    store.subscribeActiveWorkout(good);
    store.setActiveWorkout(null);
    expect(good).toHaveBeenCalled();

    store.resetActiveWorkoutStore();
    mem.raw.exec('DROP TABLE workouts');
    await expect(store.refreshActiveWorkout()).resolves.toBeUndefined();
    expect(store.getActiveWorkoutState().loaded).toBe(true);
  });
});

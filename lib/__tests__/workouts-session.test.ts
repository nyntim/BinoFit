import { createMemoryDb } from '@/test-utils/sqlite-memory';

let mem: ReturnType<typeof createMemoryDb>;
let database: typeof import('@/lib/database');
let w: typeof import('@/lib/workouts/db');
let session: typeof import('@/lib/workouts/session');
let completion: typeof import('@/lib/workouts/completion');
let store: typeof import('@/lib/workouts/active-workout-store');
let syncMock: jest.Mock;

jest.mock('@/lib/sync', () => ({ syncToSupabase: jest.fn() }));

beforeEach(async () => {
  mem = createMemoryDb();
  jest.resetModules();
  const SQLite = require('expo-sqlite');
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  database = require('@/lib/database');
  w = require('@/lib/workouts/db');
  session = require('@/lib/workouts/session');
  completion = require('@/lib/workouts/completion');
  store = require('@/lib/workouts/active-workout-store');
  syncMock = require('@/lib/sync').syncToSupabase;
  await database.getDatabase();
  mem.raw
    .prepare(
      `INSERT INTO exercises (id,name,log_type,equipment,source,created_at,updated_at)
       VALUES ('ex1','Bench','weight_reps','barbell','custom','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`
    )
    .run();
  mem.raw
    .prepare(
      `INSERT INTO exercises (id,name,log_type,equipment,source,created_at,updated_at)
       VALUES ('ex2','Squat','weight_reps','barbell','custom','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`
    )
    .run();
});

const count = (table: string, where = '1=1'): number =>
  (mem.raw.prepare(`SELECT COUNT(*) c FROM ${table} WHERE ${where}`).get() as any).c;

async function addSets(workoutId: string, exerciseId: string, sets: any[]) {
  const link = await w.addWorkoutExercise({ workout_id: workoutId, exercise_id: exerciseId });
  const out = [];
  for (const s of sets) out.push(await w.addWorkoutSet({ workout_exercise_id: link.id, ...s }));
  return { link, sets: out };
}

const NOW = new Date(2026, 5, 1, 12, 0, 0);
const iso = (d: Date) => d.toISOString();
const at = (h: number, m = 0) => new Date(2026, 5, 1, h, m, 0);

describe('startEmptyWorkout', () => {
  it('creates an active live workout dated today and publishes it to the store', async () => {
    const started = await session.startEmptyWorkout(NOW);
    expect(started.status).toBe('active');
    expect(started.source).toBe('live');
    expect(started.date).toBe('2026-06-01');
    expect(started.started_at).toBe(iso(NOW));
    expect(store.getActiveWorkoutState().workout?.id).toBe(started.id);
  });

  it('double Start returns the same workout and creates no second row', async () => {
    const a = await session.startEmptyWorkout(NOW);
    const b = await session.startEmptyWorkout(new Date(NOW.getTime() + 1000));
    expect(b.id).toBe(a.id);
    expect(count('workouts')).toBe(1);
  });
});

describe('resume after restart', () => {
  it('refreshActiveWorkout reads the active workout from SQLite into a fresh store', async () => {
    const started = await session.startEmptyWorkout(NOW);
    store.resetActiveWorkoutStore();
    expect(store.getActiveWorkoutState()).toEqual({ workout: null, loaded: false });
    await store.refreshActiveWorkout();
    const s = store.getActiveWorkoutState();
    expect(s.loaded).toBe(true);
    expect(s.workout?.id).toBe(started.id);
    expect((await w.getActiveWorkout())?.id).toBe(started.id);
  });

  it('refresh with no active workout loads null', async () => {
    await store.refreshActiveWorkout();
    expect(store.getActiveWorkoutState()).toEqual({ workout: null, loaded: true });
  });
});

describe('staleness', () => {
  const H = 60 * 60 * 1000;

  it('lastActivityAt is the start when nothing is ticked', async () => {
    const a = await session.startEmptyWorkout(NOW);
    await addSets(a.id, 'ex1', [{ weight_kg: 50, reps: 5 }]);
    const full = (await w.getWorkoutWithExercises(a.id))!;
    expect(session.lastActivityAt(full).toISOString()).toBe(iso(NOW));
  });

  it('lastActivityAt is the latest ticked set across exercises', async () => {
    const a = await session.startEmptyWorkout(NOW);
    await addSets(a.id, 'ex1', [{ weight_kg: 50, reps: 5, completed_at: iso(at(12, 10)) }]);
    await addSets(a.id, 'ex2', [
      { weight_kg: 60, reps: 5, completed_at: iso(at(12, 40)) },
      { weight_kg: 60, reps: 5, completed_at: iso(at(12, 20)) },
    ]);
    const full = (await w.getWorkoutWithExercises(a.id))!;
    expect(session.lastActivityAt(full).toISOString()).toBe(iso(at(12, 40)));
  });

  it('is not stale just under 6 h and stale at 6 h and beyond', async () => {
    const a = await session.startEmptyWorkout(NOW);
    const full = (await w.getWorkoutWithExercises(a.id))!;
    expect(session.STALE_AFTER_MS).toBe(6 * H);
    expect(session.isStale(full, new Date(NOW.getTime() + 6 * H - 1))).toBe(false);
    expect(session.isStale(full, new Date(NOW.getTime() + 6 * H))).toBe(true);
    expect(session.isStale(full, new Date(NOW.getTime() + 7 * H))).toBe(true);
  });

  it('a tick resets the stale clock', async () => {
    const a = await session.startEmptyWorkout(NOW);
    await addSets(a.id, 'ex1', [{ weight_kg: 50, reps: 5, completed_at: iso(new Date(NOW.getTime() + 5 * H)) }]);
    const full = (await w.getWorkoutWithExercises(a.id))!;
    expect(session.isStale(full, new Date(NOW.getTime() + 8 * H))).toBe(false);
    expect(session.isStale(full, new Date(NOW.getTime() + 11 * H))).toBe(true);
  });
});

describe('finishWorkout', () => {
  it("returns 'empty' and changes nothing when no set is ticked, even before the confirm check", async () => {
    const a = await session.startEmptyWorkout(NOW);
    await addSets(a.id, 'ex1', [{ weight_kg: 50, reps: 5 }]);
    expect(await session.finishWorkout(a.id, { discardUnticked: false }, at(13))).toBe('empty');
    expect(await session.finishWorkout(a.id, { discardUnticked: true }, at(13))).toBe('empty');
    expect((await w.getWorkout(a.id))?.status).toBe('active');
    expect(count('workout_sets')).toBe(1);
    expect(store.getActiveWorkoutState().workout?.id).toBe(a.id);
  });

  it("returns 'gone' for an unknown or non-active workout", async () => {
    expect(await session.finishWorkout('nope', { discardUnticked: false }, NOW)).toBe('gone');
  });

  it("returns 'gone' for a finished workout", async () => {
    const a = await session.startEmptyWorkout(NOW);
    await addSets(a.id, 'ex1', [{ weight_kg: 50, reps: 5, completed_at: iso(at(12, 5)) }]);
    expect(await session.finishWorkout(a.id, { discardUnticked: false }, at(13))).toBe('finished');
    expect(await session.finishWorkout(a.id, { discardUnticked: false }, at(13))).toBe('gone');
  });

  it('keeps ticked sets, drops empty ones, removes exercises left with none', async () => {
    const a = await session.startEmptyWorkout(NOW);
    const e1 = await addSets(a.id, 'ex1', [
      { weight_kg: 50, reps: 5, completed_at: iso(at(12, 5)) },
      {}, // empty
    ]);
    const e2 = await addSets(a.id, 'ex2', [{}]);
    expect(await session.finishWorkout(a.id, { discardUnticked: false }, at(13))).toBe('finished');
    expect(count('workout_sets', `workout_exercise_id='${e1.link.id}'`)).toBe(1);
    expect(count('workout_exercises', `id='${e2.link.id}'`)).toBe(0);
    expect(count('workout_sets', `workout_exercise_id='${e2.link.id}'`)).toBe(0);
    expect(store.getActiveWorkoutState().workout).toBeNull();
    expect(syncMock).toHaveBeenCalled();
  });

  it("filled unticked sets give 'needs-confirm' with nothing changed", async () => {
    const a = await session.startEmptyWorkout(NOW);
    await addSets(a.id, 'ex1', [
      { weight_kg: 50, reps: 5, completed_at: iso(at(12, 5)) },
      { weight_kg: 55, reps: 5 },
    ]);
    expect(await session.finishWorkout(a.id, { discardUnticked: false }, at(13))).toBe('needs-confirm');
    expect((await w.getWorkout(a.id))?.status).toBe('active');
    expect(count('workout_sets')).toBe(2);
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('with discardUnticked drops filled unticked sets and finishes', async () => {
    const a = await session.startEmptyWorkout(NOW);
    await addSets(a.id, 'ex1', [
      { weight_kg: 50, reps: 5, completed_at: iso(at(12, 5)) },
      { weight_kg: 55, reps: 5 },
    ]);
    expect(await session.finishWorkout(a.id, { discardUnticked: true }, at(13))).toBe('finished');
    expect(count('workout_sets')).toBe(1);
    expect((await w.getWorkout(a.id))?.status).toBe('done');
  });

  it('duration is end minus start, end defaults to now', async () => {
    const a = await session.startEmptyWorkout(NOW);
    await addSets(a.id, 'ex1', [{ weight_kg: 50, reps: 5, completed_at: iso(at(12, 5)) }]);
    await session.finishWorkout(a.id, { discardUnticked: false }, at(13, 30));
    const row = (await w.getWorkout(a.id))!;
    expect(row.ended_at).toBe(iso(at(13, 30)));
    expect(row.duration_seconds).toBe(90 * 60);
  });

  it('finishing at the last ticked set (stale prompt) ends there, not at now', async () => {
    const a = await session.startEmptyWorkout(NOW);
    await addSets(a.id, 'ex1', [{ weight_kg: 50, reps: 5, completed_at: iso(at(12, 45)) }]);
    const full = (await w.getWorkoutWithExercises(a.id))!;
    const last = session.lastActivityAt(full);
    await session.finishWorkout(a.id, { endAt: last, discardUnticked: false }, new Date(2026, 5, 2, 9, 0));
    const row = (await w.getWorkout(a.id))!;
    expect(row.ended_at).toBe(iso(at(12, 45)));
    expect(row.duration_seconds).toBe(45 * 60);
  });

  it('endAt in the future is clamped to now; before the start is clamped to the start', async () => {
    const a = await session.startEmptyWorkout(NOW);
    await addSets(a.id, 'ex1', [{ weight_kg: 50, reps: 5, completed_at: iso(at(12, 5)) }]);
    await session.finishWorkout(a.id, { endAt: at(23), discardUnticked: false }, at(13));
    expect((await w.getWorkout(a.id))!.ended_at).toBe(iso(at(13)));

    const b = await w.createWorkout({ date: '2026-06-02', status: 'active', started_at: iso(NOW) });
    await addSets(b.id, 'ex1', [{ weight_kg: 50, reps: 5, completed_at: iso(at(12, 5)) }]);
    await session.finishWorkout(b.id, { endAt: at(8), discardUnticked: false }, at(13));
    const row = (await w.getWorkout(b.id))!;
    expect(row.ended_at).toBe(iso(NOW));
    expect(row.duration_seconds).toBe(0);
  });

  it('a session started before midnight and finished after is dated by its start', async () => {
    const start = new Date(2026, 5, 1, 23, 30, 0);
    const a = await session.startEmptyWorkout(start);
    expect(a.date).toBe('2026-06-01');
    await addSets(a.id, 'ex1', [{ weight_kg: 50, reps: 5, completed_at: iso(new Date(2026, 5, 2, 0, 10)) }]);
    await session.finishWorkout(a.id, { discardUnticked: false }, new Date(2026, 5, 2, 0, 40));
    const row = (await w.getWorkout(a.id))!;
    expect(row.date).toBe('2026-06-01');
    expect(row.duration_seconds).toBe(70 * 60);
  });
});

describe('discardActiveWorkout', () => {
  it('hard-deletes the workout, its exercises and sets, and clears the store', async () => {
    const a = await session.startEmptyWorkout(NOW);
    await addSets(a.id, 'ex1', [{ weight_kg: 50, reps: 5, completed_at: iso(at(12, 5)) }]);
    await session.discardActiveWorkout(a.id);
    expect(count('workouts')).toBe(0);
    expect(count('workout_exercises')).toBe(0);
    expect(count('workout_sets')).toBe(0);
    expect(store.getActiveWorkoutState().workout).toBeNull();
    // A new session can start afterwards.
    expect((await session.startEmptyWorkout(at(14))).id).not.toBe(a.id);
  });
});

describe('planFinish (pure)', () => {
  const base = (exercises: any[], over: any = {}): any => ({
    id: 'w1',
    status: 'active',
    source: 'live',
    name: null,
    date: '2026-06-01',
    started_at: iso(NOW),
    ended_at: null,
    duration_seconds: null,
    notes: null,
    routine_id: null,
    created_at: iso(NOW),
    updated_at: iso(NOW),
    exercises,
    ...over,
  });
  const set = (id: string, over: any = {}) => ({
    id, weight_kg: null, reps: null, duration_seconds: null, distance_m: null, completed_at: null, ...over,
  });
  const ex = (id: string, sets: any[]) => ({ id, exercise: { log_type: 'weight_reps' }, sets });

  it('hasData is false with no ticked set, even if filled unticked sets exist', () => {
    const plan = completion.planFinish(base([ex('e1', [set('s1', { weight_kg: 5, reps: 5 })])]), at(13), { discardUnticked: false });
    expect(plan.hasData).toBe(false);
  });

  it('flags filled unticked sets and needsConfirm only without discardUnticked', () => {
    const w1 = base([
      ex('e1', [set('s1', { weight_kg: 5, reps: 5, completed_at: iso(at(12, 5)) }), set('s2', { weight_kg: 5, reps: 5 }), set('s3')]),
    ]);
    const p1 = completion.planFinish(w1, at(13), { discardUnticked: false });
    expect(p1.hasData).toBe(true);
    expect(p1.filledUntickedSetIds).toEqual(['s2']);
    expect(p1.needsConfirm).toBe(true);
    const p2 = completion.planFinish(w1, at(13), { discardUnticked: true });
    expect(p2.needsConfirm).toBe(false);
    expect(p2.deleteSetIds).toEqual(expect.arrayContaining(['s2', 's3']));
    expect(p2.tickSetIds).toEqual([]);
  });

  it('removes exercises with no ticked set and keeps ticked ones', () => {
    const plan = completion.planFinish(
      base([ex('e1', [set('s1', { weight_kg: 5, reps: 5, completed_at: iso(at(12, 5)) })]), ex('e2', [set('s2')])]),
      at(13),
      { discardUnticked: false }
    );
    expect(plan.removeExerciseIds).toEqual(['e2']);
    expect(plan.deleteSetIds).not.toContain('s1');
    expect(plan.patch.status).toBe('done');
  });

  it('end clamps to [start, now] and duration is end - start in seconds', () => {
    const w1 = base([ex('e1', [set('s1', { weight_kg: 5, reps: 5, completed_at: iso(at(12, 5)) })])]);
    expect(completion.planFinish(w1, at(13), { discardUnticked: false }).patch).toMatchObject({
      ended_at: iso(at(13)), duration_seconds: 3600,
    });
    expect(completion.planFinish(w1, at(13), { endAt: at(12, 30), discardUnticked: false }).patch).toMatchObject({
      ended_at: iso(at(12, 30)), duration_seconds: 1800,
    });
    expect(completion.planFinish(w1, at(13), { endAt: at(20), discardUnticked: false }).patch.ended_at).toBe(iso(at(13)));
    expect(completion.planFinish(w1, at(13), { endAt: at(9), discardUnticked: false }).patch).toMatchObject({
      ended_at: iso(NOW), duration_seconds: 0,
    });
  });

  it('dates the workout by its local start day', () => {
    const start = new Date(2026, 5, 1, 23, 30);
    const w1 = base([ex('e1', [set('s1', { weight_kg: 5, reps: 5, completed_at: iso(start) })])], {
      started_at: iso(start), date: '2026-05-31',
    });
    const plan = completion.planFinish(w1, new Date(2026, 5, 2, 1, 0), { discardUnticked: false });
    expect(plan.patch.date).toBe('2026-06-01');
  });
});

describe('elapsedSeconds', () => {
  it('floors whole seconds, never negative, 0 for missing or invalid start', () => {
    const { elapsedSeconds } = require('@/components/workouts/ActiveWorkoutBar');
    const start = '2026-06-01T12:00:00.000Z';
    const ms = new Date(start).getTime();
    expect(elapsedSeconds(start, ms + 90_999)).toBe(90);
    expect(elapsedSeconds(start, ms - 5000)).toBe(0);
    expect(elapsedSeconds(null, ms)).toBe(0);
    expect(elapsedSeconds('garbage', ms)).toBe(0);
  });
});

describe('finish-flow button wiring', () => {
  let alertMock: jest.SpyInstance;
  let flow: typeof import('@/lib/workouts/finish-flow');

  beforeEach(() => {
    flow = require('@/lib/workouts/finish-flow');
    const { Alert } = require('react-native');
    alertMock = jest.spyOn(Alert, 'alert');
  });
  afterEach(() => alertMock.mockRestore());

  const press = (label: string) =>
    alertMock.mockImplementation((_t: string, _m: string, buttons: any[]) => {
      buttons.find((b) => b.text === label).onPress();
    });

  it("confirmAndFinish returns 'gone' for an unknown workout without an alert", async () => {
    expect(await flow.confirmAndFinish('nope')).toBe('gone');
  });

  it('confirmAndDiscard: Cancel cancels, Discard deletes', async () => {
    const a = await session.startEmptyWorkout(new Date());
    press('Cancel');
    expect(await flow.confirmAndDiscard(a.id)).toBe('cancelled');
    expect(count('workouts')).toBe(1);
    press('Discard');
    expect(await flow.confirmAndDiscard(a.id)).toBe('discarded');
    expect(count('workouts')).toBe(0);
  });

  it('confirmAndFinish with no ticked set offers discard', async () => {
    const a = await session.startEmptyWorkout(new Date());
    press('Keep going');
    expect(await flow.confirmAndFinish(a.id)).toBe('cancelled');
    expect(count('workouts')).toBe(1);
    press('Discard workout');
    expect(await flow.confirmAndFinish(a.id)).toBe('discarded');
    expect(count('workouts')).toBe(0);
  });

  it('confirmAndFinish with filled unticked sets asks, then discards them and finishes', async () => {
    const a = await session.startEmptyWorkout(new Date());
    await addSets(a.id, 'ex1', [
      { weight_kg: 50, reps: 5, completed_at: new Date().toISOString() },
      { weight_kg: 55, reps: 5 },
    ]);
    press('Cancel');
    expect(await flow.confirmAndFinish(a.id)).toBe('cancelled');
    expect((await w.getWorkout(a.id))?.status).toBe('active');
    press('Discard and finish');
    expect(await flow.confirmAndFinish(a.id)).toBe('finished');
    expect((await w.getWorkout(a.id))?.status).toBe('done');
    expect(count('workout_sets')).toBe(1);
  });

  it('confirmAndFinish finishes without any alert when all filled sets are ticked', async () => {
    const a = await session.startEmptyWorkout(new Date());
    await addSets(a.id, 'ex1', [{ weight_kg: 50, reps: 5, completed_at: new Date().toISOString() }]);
    expect(await flow.confirmAndFinish(a.id)).toBe('finished');
    expect(alertMock).not.toHaveBeenCalled();
  });
});

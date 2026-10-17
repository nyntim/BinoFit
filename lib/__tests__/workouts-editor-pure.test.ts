import { DEFAULT_REST_SECONDS, formatPreviousSet, prefillSets, previousFor, resolveRestSeconds } from '@/lib/workouts/prefill';
import { setVolumeKg, workoutVolumeKg } from '@/lib/workouts/volume';
import { endFromDuration, isSetFilled, planSave, tickPatch } from '@/lib/workouts/completion';
import { applySchedule, cellPatch, cellText, editorReducer, setBadges, setColumns } from '@/lib/workouts/editor-state';
import { createWriteQueue } from '@/lib/workouts/write-queue';
import { formatHoursMinutes, formatShortDate, parseClockDigits } from '@/lib/workouts/format';

const set = (o: any = {}): any => ({
  id: 's', workout_exercise_id: 'we1', position: 0, set_type: 'normal', weight_kg: null, reps: null,
  duration_seconds: null, distance_m: null, rpe: null, completed_at: null, ...o,
});

describe('setVolumeKg', () => {
  const wr = { log_type: 'weight_reps', per_side: false } as const;
  it('multiplies weight by reps', () => {
    expect(setVolumeKg(set({ weight_kg: 50, reps: 10 }), wr as any)).toBe(500);
  });
  it('excludes warmups', () => {
    expect(setVolumeKg(set({ set_type: 'warmup', weight_kg: 50, reps: 10 }), wr as any)).toBe(0);
  });
  it('counts both sides for per-side exercises', () => {
    expect(setVolumeKg(set({ weight_kg: 20, reps: 10 }), { log_type: 'weight_reps', per_side: true } as any)).toBe(400);
  });
  it('bodyweight reps count added load only', () => {
    const bw = { log_type: 'bodyweight_reps', per_side: false } as any;
    expect(setVolumeKg(set({ weight_kg: 10, reps: 8 }), bw)).toBe(80);
    expect(setVolumeKg(set({ weight_kg: null, reps: 8 }), bw)).toBe(0);
  });
  it('plate-loaded counts logged plates only (no base weight added)', () => {
    expect(setVolumeKg(set({ weight_kg: 60, reps: 5 }), { log_type: 'weight_reps', per_side: false, equipment: 'plate_loaded' } as any)).toBe(300);
  });
  it('assisted, duration and distance count 0', () => {
    for (const log_type of ['assisted', 'duration', 'distance_duration']) {
      expect(setVolumeKg(set({ weight_kg: 30, reps: 10, duration_seconds: 60 }), { log_type, per_side: false } as any)).toBe(0);
    }
  });
  it('unknown exercise counts 0', () => {
    expect(setVolumeKg(set({ weight_kg: 50, reps: 10 }), null)).toBe(0);
  });
  it('workout volume sums every exercise', () => {
    const total = workoutVolumeKg({
      exercises: [
        { exercise: wr as any, sets: [set({ weight_kg: 10, reps: 10 }), set({ weight_kg: 10, reps: 5, set_type: 'warmup' })] },
        { exercise: null, sets: [set({ weight_kg: 99, reps: 9 })] },
        { exercise: { log_type: 'weight_reps', per_side: true } as any, sets: [set({ weight_kg: 5, reps: 5 })] },
      ],
    });
    expect(total).toBe(150);
  });
});

describe('prefill', () => {
  it('copies values and set types in index order without tick or RPE', () => {
    const out = prefillSets([
      set({ set_type: 'warmup', weight_kg: 20, reps: 10, rpe: 7, completed_at: 'x' }),
      set({ weight_kg: 60, reps: 5, rpe: 9, completed_at: 'y' }),
    ]);
    expect(out.map((s) => s.set_type)).toEqual(['warmup', 'normal']);
    expect(out.map((s) => s.weight_kg)).toEqual([20, 60]);
    expect(out.every((s) => s.rpe === null && s.completed_at === null)).toBe(true);
  });
  it('gives one empty set with no history', () => {
    expect(prefillSets([])).toEqual([{}]);
  });
  it('previousFor reads by index and returns null past the end', () => {
    const prev = [set({ id: 'a' }), set({ id: 'b' })];
    expect(previousFor(1, prev)?.id).toBe('b');
    expect(previousFor(2, prev)).toBeNull();
    expect(previousFor(0, undefined)).toBeNull();
  });
  it('rest resolves last, then default, then 90, keeping 0', () => {
    expect(resolveRestSeconds(120, 60)).toBe(120);
    expect(resolveRestSeconds(null, 60)).toBe(60);
    expect(resolveRestSeconds(undefined, null)).toBe(DEFAULT_REST_SECONDS);
    expect(DEFAULT_REST_SECONDS).toBe(90);
    expect(resolveRestSeconds(0, 60)).toBe(0);
    expect(resolveRestSeconds(null, 0)).toBe(0);
  });
  it('formats previous sets per log type', () => {
    expect(formatPreviousSet(set({ weight_kg: 55, reps: 10 }), 'weight_reps', false, 'kg')).toBe('55 × 10');
    expect(formatPreviousSet(set({ weight_kg: 30, reps: 10 }), 'weight_reps', true, 'kg')).toBe('30 × 10/side');
    expect(formatPreviousSet(set({ weight_kg: 10, reps: 8 }), 'bodyweight_reps', false, 'kg')).toBe('+10 × 8');
    expect(formatPreviousSet(set({ reps: 12 }), 'bodyweight_reps', false, 'kg')).toBe('BW × 12');
    expect(formatPreviousSet(set({ weight_kg: 20, reps: 8 }), 'assisted', false, 'kg')).toBe('-20 × 8');
    expect(formatPreviousSet(set({ duration_seconds: 90 }), 'duration', false, 'kg')).toBe('1:30');
    expect(formatPreviousSet(set({ distance_m: 5000, duration_seconds: 1650 }), 'distance_duration', false, 'kg')).toBe('5 km · 27:30');
    expect(formatPreviousSet(null, 'weight_reps', false, 'kg')).toBeNull();
    expect(formatPreviousSet(set(), 'weight_reps', false, 'kg')).toBeNull();
  });
});

describe('isSetFilled', () => {
  it('weight_reps needs weight (0 allowed) and reps', () => {
    expect(isSetFilled(set({ weight_kg: 0, reps: 5 }), 'weight_reps')).toBe(true);
    expect(isSetFilled(set({ weight_kg: 50 }), 'weight_reps')).toBe(false);
    expect(isSetFilled(set({ reps: 5 }), 'weight_reps')).toBe(false);
  });
  it('bodyweight and assisted need reps only', () => {
    expect(isSetFilled(set({ reps: 5 }), 'bodyweight_reps')).toBe(true);
    expect(isSetFilled(set({ reps: 5 }), 'assisted')).toBe(true);
    expect(isSetFilled(set({ weight_kg: 5 }), 'assisted')).toBe(false);
  });
  it('duration and distance_duration need time', () => {
    expect(isSetFilled(set({ duration_seconds: 30 }), 'duration')).toBe(true);
    expect(isSetFilled(set({ duration_seconds: 30 }), 'distance_duration')).toBe(true);
    expect(isSetFilled(set({ distance_m: 1000 }), 'distance_duration')).toBe(false);
  });
});

describe('planSave', () => {
  const ex = (id: string, log_type: string, sets: any[]): any => ({ id, exercise: { log_type }, sets });
  const w = (exercises: any[], o: any = {}): any => ({
    id: 'w', started_at: '2026-10-15T10:00:00.000Z', duration_seconds: 3600, exercises, ...o,
  });
  const now = new Date('2026-10-15T12:00:00.000Z');

  it('drops empty sets, removes empty exercises, ticks the rest and patches done', () => {
    const plan = planSave(
      w([
        ex('e1', 'weight_reps', [
          set({ id: 'a', weight_kg: 50, reps: 5 }),
          set({ id: 'b' }),
          set({ id: 'c', weight_kg: 50, reps: 5, completed_at: 't' }),
        ]),
        ex('e2', 'weight_reps', [set({ id: 'd' })]),
      ]),
      now
    );
    expect(plan.deleteSetIds).toEqual(['b']);
    expect(plan.tickSetIds).toEqual(['a']);
    expect(plan.removeExerciseIds).toEqual(['e2']);
    expect(plan.hasData).toBe(true);
    expect(plan.patch).toEqual({ status: 'done', ended_at: '2026-10-15T11:00:00.000Z' });
    expect(plan.tickedAt).toBe('2026-10-15T11:00:00.000Z');
  });
  it('without a start uses now and no ended_at', () => {
    const plan = planSave(w([ex('e', 'weight_reps', [set({ id: 'a', weight_kg: 1, reps: 1 })])], { started_at: null }), now);
    expect(plan.patch).toEqual({ status: 'done' });
    expect(plan.tickedAt).toBe(now.toISOString());
  });
  it('hasData is false when nothing is filled', () => {
    expect(planSave(w([ex('e', 'weight_reps', [set()])]), now).hasData).toBe(false);
  });
  it('treats an unknown exercise as weight_reps', () => {
    const plan = planSave(w([{ id: 'e', exercise: null, sets: [set({ id: 'a', weight_kg: 1, reps: 1 })] }]), now);
    expect(plan.tickSetIds).toEqual(['a']);
  });
  it('endFromDuration handles missing and invalid input', () => {
    expect(endFromDuration(null, 60)).toBeNull();
    expect(endFromDuration('2026-10-15T10:00:00.000Z', null)).toBeNull();
    expect(endFromDuration('nope', 60)).toBeNull();
    expect(endFromDuration('2026-10-15T10:00:00.000Z', 0)).toBe('2026-10-15T10:00:00.000Z');
  });
  it('tickPatch copies previous only into an empty set', () => {
    const prev = { weight_kg: 40, reps: 8, duration_seconds: null, distance_m: null };
    expect(tickPatch(set(), 'weight_reps', prev, 'T')).toEqual({ completed_at: 'T', weight_kg: 40, reps: 8, duration_seconds: null, distance_m: null });
    expect(tickPatch(set({ weight_kg: 1, reps: 1 }), 'weight_reps', prev, 'T')).toEqual({ completed_at: 'T' });
    expect(tickPatch(set(), 'weight_reps', null, 'T')).toEqual({ completed_at: 'T' });
    // A partly filled set keeps what was typed and only gets the empty fields.
    expect(tickPatch(set({ weight_kg: 70 }), 'weight_reps', prev, 'T')).toEqual({ completed_at: 'T', reps: 8, duration_seconds: null, distance_m: null });
  });
});

describe('write queue', () => {
  const deferred = () => {
    let resolve!: () => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };

  it('runs tasks strictly in order, edit on a new id only after the add finishes', async () => {
    const log: string[] = [];
    const q = createWriteQueue(jest.fn());
    const add = deferred();
    q.enqueue(async () => { log.push('add:start'); await add.promise; log.push('add:end'); });
    q.enqueue(async () => { log.push('edit'); });
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toEqual(['add:start']);
    expect(q.pending()).toBe(2);
    add.resolve();
    await q.drain();
    expect(log).toEqual(['add:start', 'add:end', 'edit']);
    expect(q.pending()).toBe(0);
  });
  it('an error is reported and does not stop later writes; enqueue never rejects', async () => {
    const onError = jest.fn();
    const q = createWriteQueue(onError);
    const later = jest.fn(async () => {});
    const failing = q.enqueue(async () => { throw new Error('boom'); });
    q.enqueue(later);
    await expect(failing).resolves.toBeUndefined();
    await q.drain();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
    expect(later).toHaveBeenCalled();
  });
  it('a throwing onError does not break the queue', async () => {
    const q = createWriteQueue(() => { throw new Error('x'); });
    const later = jest.fn(async () => {});
    q.enqueue(async () => { throw new Error('boom'); });
    q.enqueue(later);
    await q.drain();
    expect(later).toHaveBeenCalled();
  });
  it('drain resolves immediately when empty and waits for deferred tasks', async () => {
    const q = createWriteQueue(jest.fn());
    await q.drain();
    const d = deferred();
    q.enqueue(() => d.promise);
    let drained = false;
    q.drain().then(() => { drained = true; });
    await Promise.resolve();
    expect(drained).toBe(false);
    d.resolve();
    await q.drain();
    expect(drained).toBe(true);
  });
});

describe('parseClockDigits', () => {
  it('fills digits from the right', () => {
    expect(parseClockDigits('2730', 'ms')).toBe(27 * 60 + 30);
    expect(parseClockDigits('45', 'ms')).toBe(45);
    expect(parseClockDigits('5', 'ms')).toBe(5);
    expect(parseClockDigits('150', 'hm')).toBe(3600 + 50 * 60);
    expect(parseClockDigits('90', 'hm')).toBe(90 * 60);
    expect(parseClockDigits('5', 'hm')).toBe(300);
    expect(parseClockDigits('1:30', 'ms')).toBe(90);
    expect(parseClockDigits('1:40:00', 'ms')).toBe(6000);
  });
  it('rejects empty and invalid input', () => {
    expect(parseClockDigits('', 'ms')).toBeNull();
    expect(parseClockDigits('  ', 'ms')).toBeNull();
    expect(parseClockDigits('2775', 'ms')).toBeNull();
    expect(parseClockDigits('12a', 'ms')).toBeNull();
    expect(parseClockDigits('1234567', 'ms')).toBeNull();
    expect(parseClockDigits('1:61:00', 'ms')).toBeNull();
  });
  it('formats short dates and hours:minutes', () => {
    expect(formatShortDate('2025-10-15')).toBe('Wed 15 Oct');
    expect(formatHoursMinutes(3000)).toBe('0:50');
    expect(formatHoursMinutes(3600 + 5 * 60)).toBe('1:05');
  });
});

describe('cells in kg and lb', () => {
  it('shows weights in the display unit', () => {
    expect(cellText({ weight_kg: 45.3592 }, 'weight', 'lb')).toBe('100');
    expect(cellText({ weight_kg: 50 }, 'weight', 'kg')).toBe('50');
    expect(cellText({ weight_kg: null }, 'weight', 'kg')).toBe('');
    expect(cellText({ duration_seconds: 90 }, 'duration', 'kg')).toBe('1:30');
    expect(cellText({ distance_m: 5000 }, 'distance', 'kg')).toBe('5.00');
    expect(cellText({ reps: 0 }, 'reps', 'kg')).toBe('0');
  });
  it('stores lb input as kg and kg input unchanged', () => {
    expect(cellPatch('weight', '100', 'lb')!.weight_kg).toBeCloseTo(45.3592, 3);
    expect(cellPatch('weight', '62,5', 'kg')).toEqual({ weight_kg: 62.5 });
  });
  it('empty text clears and invalid text returns null', () => {
    expect(cellPatch('weight', '', 'kg')).toEqual({ weight_kg: null });
    expect(cellPatch('weight', 'abc', 'kg')).toBeNull();
    expect(cellPatch('weight', '6000', 'kg')).toBeNull();
    expect(cellPatch('reps', '1000', 'kg')).toBeNull();
    expect(cellPatch('reps', '12', 'kg')).toEqual({ reps: 12 });
    expect(cellPatch('rpe', '11', 'kg')).toBeNull();
    expect(cellPatch('rpe', '8.5', 'kg')).toEqual({ rpe: 8.5 });
    expect(cellPatch('duration', '2730', 'kg')).toEqual({ duration_seconds: 1650 });
    expect(cellPatch('duration', '99', 'kg')).toBeNull();
  });
  it('distance converts miles to metres in lb mode', () => {
    expect(cellPatch('distance', '1', 'lb')!.distance_m).toBeCloseTo(1609.344, 1);
    expect(cellPatch('distance', '5', 'kg')).toEqual({ distance_m: 5000 });
  });
});

describe('editorReducer', () => {
  const base = (): any => ({
    id: 'w', name: null,
    exercises: [
      { id: 'e1', rest_seconds: 90, notes: null, sets: [set({ id: 'a', workout_exercise_id: 'e1' }), set({ id: 'b', workout_exercise_id: 'e1' })] },
      { id: 'e2', rest_seconds: 90, notes: null, sets: [] },
    ],
  });
  it('load replaces state and null state ignores other actions', () => {
    expect(editorReducer(null, { type: 'meta', patch: { name: 'x' } })).toBeNull();
    expect(editorReducer(null, { type: 'load', workout: base() })).not.toBeNull();
    expect(editorReducer(base(), { type: 'load', workout: null })).toBeNull();
  });
  it('meta, addSet (once), updateSet, deleteSet, removeExercise, updateExercise', () => {
    const s0 = base();
    const snapshot = JSON.stringify(s0);
    let s = editorReducer(s0, { type: 'meta', patch: { name: 'Push' } })!;
    expect(s.name).toBe('Push');
    const added = set({ id: 'c', workout_exercise_id: 'e2' });
    s = editorReducer(s, { type: 'addSet', set: added })!;
    s = editorReducer(s, { type: 'addSet', set: added })!;
    expect(s.exercises[1].sets).toHaveLength(1);
    s = editorReducer(s, { type: 'updateSet', id: 'a', patch: { reps: 9 } })!;
    expect(s.exercises[0].sets[0].reps).toBe(9);
    s = editorReducer(s, { type: 'deleteSet', id: 'b' })!;
    expect(s.exercises[0].sets.map((x: any) => x.id)).toEqual(['a']);
    s = editorReducer(s, { type: 'updateExercise', id: 'e1', patch: { rest_seconds: 0 } })!;
    expect(s.exercises[0].rest_seconds).toBe(0);
    s = editorReducer(s, { type: 'removeExercise', id: 'e1' })!;
    expect(s.exercises.map((e) => e.id)).toEqual(['e2']);
    expect(JSON.stringify(s0)).toBe(snapshot);
  });
  it('ignores unknown ids', () => {
    const s = base();
    expect(editorReducer(s, { type: 'updateSet', id: 'zz', patch: { reps: 1 } })).toEqual(s);
    expect(editorReducer(s, { type: 'addSet', set: set({ id: 'q', workout_exercise_id: 'nope' }) })).toEqual(s);
  });
  it('numbers badges skipping special sets', () => {
    const b = setBadges([{ set_type: 'warmup' }, { set_type: 'normal' }, { set_type: 'drop' }, { set_type: 'normal' }, { set_type: 'failure' }]);
    expect(b.map((x) => x.label)).toEqual(['W', '1', 'D', '2', 'F']);
    expect(b[3].accessibilityLabel).toBe('Set 2');
  });
  it('builds columns per log type', () => {
    const keys = (lt: any, ps = false, o = { showRpe: false, showDone: false }) => setColumns(lt, ps, 'kg', o).map((c) => c.key);
    expect(keys('weight_reps')).toEqual(['badge', 'previous', 'weight', 'reps']);
    expect(keys('weight_reps', false, { showRpe: true, showDone: true })).toEqual(['badge', 'previous', 'weight', 'reps', 'rpe', 'done']);
    expect(keys('duration', false, { showRpe: true, showDone: false })).toEqual(['badge', 'previous', 'duration']);
    expect(keys('distance_duration')).toEqual(['badge', 'distance', 'duration', 'pace']);
    expect(setColumns('weight_reps', true, 'kg', { showRpe: false, showDone: false })[3].label).toBe('Reps/side');
    expect(setColumns('bodyweight_reps', false, 'lb', { showRpe: false, showDone: false })[2].label).toBe('+lb');
  });
  it('applySchedule never puts the start after now', () => {
    const cur = { date: '2026-10-15', started_at: new Date(2026, 9, 15, 9, 0).toISOString(), duration_seconds: 3600 };
    const now = new Date(2026, 9, 15, 10, 0);
    const p = applySchedule(cur, { time: new Date(2026, 9, 15, 18, 0) }, now);
    expect(p.started_at).toBe(now.toISOString());
  });
  it('planSave clamps start and end to now', () => {
    const now = new Date('2026-10-15T12:00:00.000Z');
    const plan = planSave(
      { id: 'w', started_at: '2026-10-15T11:30:00.000Z', duration_seconds: 3600, exercises: [{ id: 'e', exercise: { log_type: 'weight_reps' }, sets: [set({ id: 'a', weight_kg: 1, reps: 1 })] }] } as any,
      now
    );
    expect(plan.patch.ended_at).toBe(now.toISOString());
    expect(plan.tickedAt).toBe(now.toISOString());
  });
  it('applySchedule keeps ended_at at start + duration', () => {
    const cur = { date: '2026-10-15', started_at: new Date(2026, 9, 15, 9, 0).toISOString(), duration_seconds: 3600 };
    const p = applySchedule(cur, { duration_seconds: 1800 });
    expect(p.ended_at).toBe(new Date(2026, 9, 15, 9, 30).toISOString());
    const p2 = applySchedule(cur, { date: new Date(2026, 9, 10) });
    expect(p2.date).toBe('2026-10-10');
    expect(p2.started_at).toBe(new Date(2026, 9, 10, 9, 0).toISOString());
  });
});

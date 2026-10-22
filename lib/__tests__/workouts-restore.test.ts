import { createMemoryDb } from '@/test-utils/sqlite-memory';

let mem: ReturnType<typeof createMemoryDb>;
let apply: typeof import('@/lib/workouts/restore-apply');
let w: typeof import('@/lib/workouts/db');

beforeEach(async () => {
  jest.resetModules();
  mem = createMemoryDb();
  const SQLite = require('expo-sqlite');
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  const database = require('@/lib/database');
  apply = require('@/lib/workouts/restore-apply');
  w = require('@/lib/workouts/db');
  await database.getDatabase();
});

const OLD = '2026-01-01T00:00:00.000Z';
const MID = '2026-03-01T00:00:00.000Z';
const NEW = '2026-06-01T00:00:00.000Z';

const rowOf = (table: string, id: string): any => mem.raw.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
const count = (table: string): number => (mem.raw.prepare(`SELECT COUNT(*) c FROM ${table}`).get() as any).c;

const rEx = (over: Record<string, any> = {}): any => ({
  id: 'ex1', user_id: 'u', name: 'Bench', log_type: 'weight_reps', primary_muscles: ['chest'],
  secondary_muscles: ['triceps'], equipment: 'barbell', brand: null, load_type: null,
  base_weight_kg: null, per_side: false, setup_notes: null, default_rest_seconds: null, met: null,
  source: 'custom', hidden: false, created_at: OLD, updated_at: MID, deleted_at: null, ...over,
});
const rWo = (over: Record<string, any> = {}): any => ({
  id: 'w1', user_id: 'u', status: 'done', source: 'live', name: 'Push', date: '2026-02-01',
  started_at: null, ended_at: null, duration_seconds: 3600, notes: null, routine_id: null,
  created_at: OLD, updated_at: MID, deleted_at: null, ...over,
});
const rLink = (over: Record<string, any> = {}): any => ({
  id: 'l1', user_id: 'u', workout_id: 'w1', exercise_id: 'ex1', position: 0, rest_seconds: null,
  notes: null, created_at: OLD, updated_at: MID, deleted_at: null, ...over,
});
const rSet = (over: Record<string, any> = {}): any => ({
  id: 's1', user_id: 'u', workout_id: 'w1', workout_exercise_id: 'l1', position: 0, set_type: 'normal',
  weight_kg: 60, reps: 5, duration_seconds: null, distance_m: null, rpe: null, completed_at: null,
  created_at: OLD, updated_at: MID, deleted_at: null, ...over,
});
const tree = (over: Record<string, any[]> = {}) => ({
  workouts: [rWo()], workoutExercises: [rLink()], sets: [rSet()], ...over,
});

describe('applyRemoteExercises', () => {
  it('inserts custom exercises marked synced and stores muscles as JSON', async () => {
    expect(await apply.applyRemoteExercises([rEx({ per_side: true })])).toBe(1);
    const r = rowOf('exercises', 'ex1');
    expect(r).toMatchObject({ name: 'Bench', source: 'custom', per_side: 1, deleted_at: null });
    expect(r.synced_at).not.toBeNull();
    expect(JSON.parse(r.primary_muscles)).toEqual(['chest']);
  });

  it('forces source custom even if the remote row claims seed', async () => {
    await apply.applyRemoteExercises([rEx({ source: 'seed' })]);
    expect(rowOf('exercises', 'ex1').source).toBe('custom');
  });

  it('never overwrites a local seed exercise', async () => {
    mem.raw
      .prepare(`INSERT INTO exercises (id,name,log_type,equipment,source,created_at,updated_at) VALUES ('ex1','Seed Bench','weight_reps','barbell','seed',?,?)`)
      .run(OLD, OLD);
    expect(await apply.applyRemoteExercises([rEx({ updated_at: NEW }), rEx({ updated_at: NEW, deleted_at: NEW })])).toBe(0);
    expect(rowOf('exercises', 'ex1')).toMatchObject({ name: 'Seed Bench', source: 'seed', deleted_at: null });
  });

  it('last write wins: newer remote updates, older remote is ignored', async () => {
    await apply.applyRemoteExercises([rEx({ name: 'Mid', updated_at: MID })]);
    await apply.applyRemoteExercises([rEx({ name: 'Old', updated_at: OLD })]);
    expect(rowOf('exercises', 'ex1').name).toBe('Mid');
    await apply.applyRemoteExercises([rEx({ name: 'New', updated_at: NEW })]);
    expect(rowOf('exercises', 'ex1').name).toBe('New');
  });

  it('a newer remote tombstone keeps the local row as a synced tombstone', async () => {
    await apply.applyRemoteExercises([rEx()]);
    await apply.applyRemoteExercises([rEx({ updated_at: NEW, deleted_at: NEW })]);
    const r = rowOf('exercises', 'ex1');
    expect(r).toBeDefined();
    expect(r.deleted_at).toBe(NEW);
    expect(r.synced_at).not.toBeNull();
  });

  it('an older remote tombstone does not delete a newer local row', async () => {
    await apply.applyRemoteExercises([rEx({ updated_at: NEW })]);
    await apply.applyRemoteExercises([rEx({ updated_at: MID, deleted_at: MID })]);
    expect(rowOf('exercises', 'ex1').deleted_at).toBeNull();
  });

  it('a remote tombstone with no local row is skipped', async () => {
    expect(await apply.applyRemoteExercises([rEx({ deleted_at: MID })])).toBe(0);
    expect(count('exercises WHERE source = \'custom\'')).toBe(0);
  });

  it('returns 0 for no rows', async () => {
    expect(await apply.applyRemoteExercises([])).toBe(0);
  });
});

describe('fix: tombstoned exercise and orphan children', () => {
  it('inserts a remote exercise tombstone with no local row when history references it', async () => {
    expect(await apply.applyRemoteExercises([rEx({ deleted_at: MID })], ['ex1'])).toBe(0);
    const row = rowOf('exercises', 'ex1');
    expect(row.name).toBe('Bench');
    expect(row.deleted_at).toBe(MID);
    expect(row.synced_at).not.toBeNull();
  });

  it('skips an unreferenced remote exercise tombstone', async () => {
    await apply.applyRemoteExercises([rEx({ deleted_at: MID })], ['other']);
    expect(rowOf('exercises', 'ex1')).toBeUndefined();
  });

  it('does not restore children whose workout is not live locally', async () => {
    await apply.applyRemoteWorkoutTree(tree({ workouts: [rWo({ deleted_at: MID })] }));
    expect(count('workout_exercises') + count('workout_sets')).toBe(0);
    await apply.applyRemoteWorkoutTree({ workouts: [], workoutExercises: [rLink()], sets: [rSet()] });
    expect(count('workout_exercises') + count('workout_sets')).toBe(0);
  });
});

describe('applyRemoteWorkoutTree playlist', () => {
  it('applies a remote playlist', async () => {
    await apply.applyRemoteWorkoutTree(tree({ workouts: [rWo({ playlist_id: 'abc123', playlist_name: 'Lift' })] }));
    expect(rowOf('workouts', 'w1')).toMatchObject({ playlist_id: 'abc123', playlist_name: 'Lift' });
  });
  it('drops a non-string or invalid id and its name', async () => {
    await apply.applyRemoteWorkoutTree(tree({ workouts: [rWo({ playlist_id: 42, playlist_name: 'x' })] }));
    expect(rowOf('workouts', 'w1')).toMatchObject({ playlist_id: null, playlist_name: null });
    await apply.applyRemoteWorkoutTree(tree({ workouts: [rWo({ id: 'w2', playlist_id: '../x', playlist_name: 'x' })], workoutExercises: [], sets: [] }));
    expect(rowOf('workouts', 'w2')).toMatchObject({ playlist_id: null, playlist_name: null });
  });
  it('an older remote does not overwrite a newer local playlist', async () => {
    await apply.applyRemoteWorkoutTree(tree({ workouts: [rWo({ playlist_id: 'newer', playlist_name: 'New', updated_at: NEW })] }));
    await apply.applyRemoteWorkoutTree(tree({ workouts: [rWo({ playlist_id: 'older', playlist_name: 'Old', updated_at: MID })] }));
    expect(rowOf('workouts', 'w1')).toMatchObject({ playlist_id: 'newer', playlist_name: 'New' });
  });
  it('a remote row without the fields restores as null', async () => {
    await apply.applyRemoteWorkoutTree(tree());
    expect(rowOf('workouts', 'w1')).toMatchObject({ playlist_id: null, playlist_name: null });
  });
});

describe('applyRemoteWorkoutTree', () => {
  it('inserts the tree marked synced and returns the workout count', async () => {
    expect(await apply.applyRemoteWorkoutTree(tree())).toBe(1);
    for (const [t, id] of [['workouts', 'w1'], ['workout_exercises', 'l1'], ['workout_sets', 's1']]) {
      expect(rowOf(t, id).synced_at).not.toBeNull();
    }
    expect(rowOf('workout_sets', 's1')).toMatchObject({ weight_kg: 60, reps: 5 });
  });

  it('restores rir, and null when the remote row has no rir key', async () => {
    await apply.applyRemoteWorkoutTree(tree({ sets: [rSet({ rir: 2 }), rSet({ id: 's2', position: 1 })] }));
    expect(rowOf('workout_sets', 's1').rir).toBe(2);
    expect(rowOf('workout_sets', 's2').rir).toBeNull();
  });

  it('last write wins for rir', async () => {
    await apply.applyRemoteWorkoutTree(tree({ sets: [rSet({ rir: 2 })] }));
    await apply.applyRemoteWorkoutTree(tree({ sets: [rSet({ rir: 5, updated_at: NEW })] }));
    expect(rowOf('workout_sets', 's1').rir).toBe(5);
    await apply.applyRemoteWorkoutTree(tree({ sets: [rSet({ rir: 9, updated_at: OLD })] }));
    expect(rowOf('workout_sets', 's1').rir).toBe(5);
  });

  it('forces status done whatever the remote row says', async () => {
    await apply.applyRemoteWorkoutTree(tree({ workouts: [rWo({ status: 'active' })] }));
    expect(rowOf('workouts', 'w1').status).toBe('done');
    await apply.applyRemoteWorkoutTree(tree({ workouts: [rWo({ status: 'draft', updated_at: NEW })] }));
    expect(rowOf('workouts', 'w1').status).toBe('done');
  });

  it('restoring an active remote workout does not take the single active slot', async () => {
    await apply.applyRemoteWorkoutTree(tree({ workouts: [rWo({ status: 'active' })] }));
    await expect(w.createWorkout({ date: '2026-06-02', status: 'active' })).resolves.toMatchObject({ status: 'active' });
  });

  it('restored rows are not pushed back', async () => {
    await apply.applyRemoteWorkoutTree(tree());
    expect(await w.getUnsyncedWorkoutTree()).toEqual({ exercises: [], workouts: [], workoutExercises: [], sets: [] });
  });

  it('a newer remote workout updates the local one, an older one does not', async () => {
    await apply.applyRemoteWorkoutTree(tree());
    await apply.applyRemoteWorkoutTree(tree({ workouts: [rWo({ name: 'Older', updated_at: OLD })], workoutExercises: [], sets: [] }));
    expect(rowOf('workouts', 'w1').name).toBe('Push');
    expect(await apply.applyRemoteWorkoutTree(tree({ workouts: [rWo({ name: 'Newer', updated_at: NEW })], workoutExercises: [], sets: [] }))).toBe(1);
    expect(rowOf('workouts', 'w1').name).toBe('Newer');
  });

  it('a tie keeps the local row', async () => {
    await apply.applyRemoteWorkoutTree(tree());
    await apply.applyRemoteWorkoutTree(tree({ workouts: [rWo({ name: 'Tie' })], workoutExercises: [], sets: [] }));
    expect(rowOf('workouts', 'w1').name).toBe('Push');
  });

  it('a newer remote workout tombstone deletes the local workout and its children', async () => {
    await apply.applyRemoteWorkoutTree(tree());
    await apply.applyRemoteWorkoutTree({
      workouts: [rWo({ updated_at: NEW, deleted_at: NEW })], workoutExercises: [], sets: [],
    });
    expect(count('workouts') + count('workout_exercises') + count('workout_sets')).toBe(0);
  });

  it('a newer remote workout tombstone deletes a local draft tree too', async () => {
    const d = await w.createWorkout({ date: '2026-06-01' });
    const link = await w.addWorkoutExercise({ workout_id: d.id, exercise_id: 'ex1' });
    await w.addWorkoutSet({ workout_exercise_id: link.id });
    const future = '2999-01-01T00:00:00.000Z';
    await apply.applyRemoteWorkoutTree({
      workouts: [rWo({ id: d.id, updated_at: future, deleted_at: future })], workoutExercises: [], sets: [],
    });
    expect(count('workouts') + count('workout_exercises') + count('workout_sets')).toBe(0);
  });

  it('an older remote workout tombstone keeps the newer local workout', async () => {
    await apply.applyRemoteWorkoutTree(tree({ workouts: [rWo({ updated_at: NEW })] }));
    await apply.applyRemoteWorkoutTree({
      workouts: [rWo({ updated_at: MID, deleted_at: MID })], workoutExercises: [], sets: [],
    });
    expect(rowOf('workouts', 'w1')).toBeDefined();
    expect(count('workout_sets')).toBe(1);
  });

  it('a remote tombstone with no local row is skipped', async () => {
    const n = await apply.applyRemoteWorkoutTree({
      workouts: [rWo({ deleted_at: MID })], workoutExercises: [rLink({ deleted_at: MID })], sets: [rSet({ deleted_at: MID })],
    });
    expect(n).toBe(0);
    expect(count('workouts') + count('workout_exercises') + count('workout_sets')).toBe(0);
  });

  it('a newer remote exercise-link tombstone deletes the link and its sets only', async () => {
    await apply.applyRemoteWorkoutTree(tree());
    await apply.applyRemoteWorkoutTree({
      workouts: [], workoutExercises: [rLink({ updated_at: NEW, deleted_at: NEW })], sets: [],
    });
    expect(count('workout_exercises') + count('workout_sets')).toBe(0);
    expect(count('workouts')).toBe(1);
  });

  it('a newer remote set tombstone deletes just that set', async () => {
    await apply.applyRemoteWorkoutTree(tree({ sets: [rSet(), rSet({ id: 's2', position: 1 })] }));
    await apply.applyRemoteWorkoutTree({
      workouts: [], workoutExercises: [], sets: [rSet({ updated_at: NEW, deleted_at: NEW })],
    });
    expect(rowOf('workout_sets', 's1')).toBeUndefined();
    expect(rowOf('workout_sets', 's2')).toBeDefined();
  });

  it('a restored workout with a missing custom exercise shows "Unknown exercise"', async () => {
    await apply.applyRemoteWorkoutTree(tree());
    const full = await w.getWorkoutWithExercises('w1');
    expect(full?.exercises[0].exercise_name).toBe('Unknown exercise');
  });

  it('exercises applied first give restored workouts their names, including tombstoned ones', async () => {
    await apply.applyRemoteExercises([rEx({ updated_at: NEW, deleted_at: NEW }), rEx({ id: 'ex2', name: 'Squat' })]);
    // tombstone with no local row is skipped, so seed ex1 via a live row first
    await apply.applyRemoteExercises([rEx()]);
    await apply.applyRemoteExercises([rEx({ updated_at: NEW, deleted_at: NEW })]);
    await apply.applyRemoteWorkoutTree(tree());
    const full = await w.getWorkoutWithExercises('w1');
    expect(full?.exercises[0].exercise_name).toBe('Bench');
  });

  it('returns 0 for an empty tree', async () => {
    expect(await apply.applyRemoteWorkoutTree({ workouts: [], workoutExercises: [], sets: [] })).toBe(0);
  });

  it('rolls back the whole transaction when a row fails', async () => {
    await expect(
      apply.applyRemoteWorkoutTree(tree({ sets: [rSet(), rSet({ id: 's2', position: null })] }))
    ).rejects.toThrow();
    expect(count('workouts') + count('workout_exercises') + count('workout_sets')).toBe(0);
  });
});

import { createMemoryDb } from '@/test-utils/sqlite-memory';

const mockUpsert = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => ({ upsert: (...a: unknown[]) => mockUpsert(table, ...a) }) },
}));
jest.mock('@/lib/auth', () => ({
  getSessionUserId: jest.fn(async () => 'uid'),
  initAuth: jest.fn(async () => ({ status: 'none', restored: false })),
  retryPendingMergeTicket: jest.fn(async () => {}),
  reconcileSyncedUid: jest.fn(async () => {}),
}));
jest.mock('@/lib/storage', () => ({
  getUserGoals: jest.fn(async () => null),
  getUserProfile: jest.fn(async () => null),
  markGoalsSynced: jest.fn(async () => {}),
  markProfileSynced: jest.fn(async () => {}),
  setLastSyncAt: jest.fn(async () => {}),
}));

let mem: ReturnType<typeof createMemoryDb>;
let sync: typeof import('@/lib/sync');
let w: typeof import('@/lib/workouts/db');

beforeEach(async () => {
  jest.resetModules();
  mockUpsert.mockReset().mockResolvedValue({ error: null });
  mem = createMemoryDb();
  const SQLite = require('expo-sqlite');
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  const database = require('@/lib/database');
  sync = require('@/lib/sync');
  w = require('@/lib/workouts/db');
  await database.getDatabase();
});

const T = '2026-06-01T00:00:00.000Z';
const insertExercise = (id: string, source = 'custom') =>
  mem.raw
    .prepare(
      `INSERT INTO exercises (id,name,log_type,equipment,source,created_at,updated_at)
       VALUES (?,?,'weight_reps','barbell',?,?,?)`
    )
    .run(id, `Ex ${id}`, source, T, T);
const rowOf = (table: string, id: string): any => mem.raw.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
const pushed = (table: string): any[] =>
  mockUpsert.mock.calls.filter((c) => c[0] === table).flatMap((c) => c[1] as any[]);
const pushedTables = () => mockUpsert.mock.calls.map((c) => c[0]).filter((t) => /exercises|workout/.test(t));

async function tree(status: 'draft' | 'active' | 'done', exerciseId = 'ex1') {
  const workout = await w.createWorkout({ date: '2026-06-01', status });
  const link = await w.addWorkoutExercise({ workout_id: workout.id, exercise_id: exerciseId });
  const set = await w.addWorkoutSet({ workout_exercise_id: link.id, weight_kg: 50, reps: 5 });
  return { workout, link, set };
}
const run = async () => {
  try {
    await sync.syncToSupabase();
  } catch {
    /* per-step failures are reported, not asserted here */
  }
};

describe('workout sync', () => {
  it('pushes only done workouts and their children; active and draft trees never push', async () => {
    insertExercise('ex1');
    const done = await tree('done');
    await tree('draft');
    await tree('active');
    await run();
    expect(pushed('workouts').map((r) => r.id)).toEqual([done.workout.id]);
    expect(pushed('workout_exercises').map((r) => r.id)).toEqual([done.link.id]);
    expect(pushed('workout_sets').map((r) => r.id)).toEqual([done.set.id]);
  });

  it('pushes in parent-first order with user_id and marks every table synced', async () => {
    insertExercise('ex1');
    const d = await tree('done');
    await run();
    expect(pushedTables()).toEqual(['exercises', 'workouts', 'workout_exercises', 'workout_sets']);
    expect(pushed('workouts')[0]).toMatchObject({ user_id: 'uid', status: 'done', deleted_at: null });
    expect(pushed('exercises')[0]).toMatchObject({ user_id: 'uid', source: 'custom' });
    for (const [t, id] of [['exercises', 'ex1'], ['workouts', d.workout.id], ['workout_exercises', d.link.id], ['workout_sets', d.set.id]]) {
      expect(rowOf(t, id).synced_at).not.toBeNull();
    }
  });

  it('pushes the set rir value, and null when unset', async () => {
    insertExercise('ex1');
    const d = await tree('done');
    const other = await w.addWorkoutSet({ workout_exercise_id: d.link.id, weight_kg: 40, reps: 8 });
    await w.updateWorkoutSet(d.set.id, { rir: 3 });
    await run();
    const sets = pushed('workout_sets');
    expect(sets.find((s) => s.id === d.set.id).rir).toBe(3);
    expect(sets.find((s) => s.id === other.id).rir).toBeNull();
  });

  it('pushes the playlist fields, null when absent', async () => {
    insertExercise('ex1');
    const a = await tree('done');
    mem.raw.prepare('UPDATE workouts SET playlist_id = ?, playlist_name = ? WHERE id = ?').run('abc123', 'Lift', a.workout.id);
    const b = await tree('done');
    await run();
    const rows = pushed('workouts');
    expect(rows.find((r) => r.id === a.workout.id)).toMatchObject({ playlist_id: 'abc123', playlist_name: 'Lift' });
    expect(rows.find((r) => r.id === b.workout.id)).toMatchObject({ playlist_id: null, playlist_name: null });
  });

  it('seed exercises never push', async () => {
    insertExercise('seed1', 'seed');
    await run();
    expect(pushed('exercises')).toEqual([]);
  });

  it('nothing to push means no workout upserts', async () => {
    await run();
    expect(pushedTables()).toEqual([]);
  });

  it('chunks large pushes into batches of 500', async () => {
    const d = await w.createWorkout({ date: '2026-06-01', status: 'done' });
    const link = await w.addWorkoutExercise({ workout_id: d.id, exercise_id: 'ex1' });
    const ins = mem.raw.prepare(
      `INSERT INTO workout_sets (id,workout_id,workout_exercise_id,position,created_at,updated_at) VALUES (?,?,?,?,?,?)`
    );
    for (let i = 0; i < 1200; i++) ins.run(`s${i}`, d.id, link.id, i, T, T);
    await run();
    const sizes = mockUpsert.mock.calls.filter((c) => c[0] === 'workout_sets').map((c) => (c[1] as any[]).length);
    expect(sizes).toEqual([500, 500, 200]);
  });

  it('deleting a done workout pushes tombstones for the whole tree, then purges them', async () => {
    insertExercise('ex1');
    const d = await tree('done');
    await run();
    mockUpsert.mockClear();
    await new Promise((r) => setTimeout(r, 5));
    await w.deleteWorkout(d.workout.id);
    await run();
    for (const t of ['workouts', 'workout_exercises', 'workout_sets']) {
      expect(pushed(t)).toHaveLength(1);
      expect(pushed(t)[0].deleted_at).toEqual(expect.any(String));
    }
    expect(rowOf('workouts', d.workout.id)).toBeUndefined();
    expect(rowOf('workout_exercises', d.link.id)).toBeUndefined();
    expect(rowOf('workout_sets', d.set.id)).toBeUndefined();
  });

  it('a hard-deleted draft pushes nothing', async () => {
    const d = await tree('draft');
    await w.discardWorkout(d.workout.id);
    await run();
    expect(pushedTables()).toEqual([]);
  });

  it('a push error keeps tombstones and leaves rows unsynced', async () => {
    insertExercise('ex1');
    const d = await tree('done');
    await w.deleteWorkout(d.workout.id);
    mockUpsert.mockResolvedValue({ error: new Error('boom') });
    await run();
    expect(rowOf('workouts', d.workout.id)).toMatchObject({ synced_at: null });
    expect(rowOf('workouts', d.workout.id).deleted_at).not.toBeNull();
    expect(rowOf('workout_sets', d.set.id)).toBeDefined();
  });

  it('a workout push error stops the tree: children are not pushed or marked', async () => {
    insertExercise('ex1');
    const d = await tree('done');
    mockUpsert.mockImplementation(async (t: string) => ({ error: t === 'workouts' ? new Error('boom') : null }));
    await run();
    expect(pushed('workout_exercises')).toEqual([]);
    expect(rowOf('workout_exercises', d.link.id).synced_at).toBeNull();
    expect(rowOf('exercises', 'ex1').synced_at).not.toBeNull();
  });

  it('a child tombstone still syncs after its parent workout was purged', async () => {
    insertExercise('ex1');
    const d = await tree('done');
    await run();
    mockUpsert.mockClear();
    await new Promise((r) => setTimeout(r, 5));
    await w.deleteWorkout(d.workout.id);
    // Workout push succeeds (and purges the workout row); children fail.
    mockUpsert.mockImplementation(async (t: string) => ({
      error: t === 'workout_exercises' || t === 'workout_sets' ? new Error('boom') : null,
    }));
    await run();
    expect(rowOf('workouts', d.workout.id)).toBeUndefined();
    expect(rowOf('workout_exercises', d.link.id)).toBeDefined();
    mockUpsert.mockReset().mockResolvedValue({ error: null });
    await run();
    expect(pushed('workout_exercises')[0]).toMatchObject({ id: d.link.id, deleted_at: expect.any(String) });
    expect(pushed('workout_sets')[0]).toMatchObject({ id: d.set.id, deleted_at: expect.any(String) });
    expect(rowOf('workout_exercises', d.link.id)).toBeUndefined();
    expect(rowOf('workout_sets', d.set.id)).toBeUndefined();
  });

  it('a set edited during the push stays unsynced and is pushed again next time', async () => {
    insertExercise('ex1');
    const d = await tree('done');
    mockUpsert.mockImplementation(async (t: string) => {
      if (t === 'workout_sets') {
        mem.raw
          .prepare("UPDATE workout_sets SET reps = 9, updated_at = '2999-01-01T00:00:00.000Z', synced_at = NULL WHERE id = ?")
          .run(d.set.id);
      }
      return { error: null };
    });
    await run();
    expect(rowOf('workout_sets', d.set.id).synced_at).toBeNull();
    mockUpsert.mockReset().mockResolvedValue({ error: null });
    await run();
    expect(pushed('workout_sets')[0].reps).toBe(9);
    expect(rowOf('workout_sets', d.set.id).synced_at).not.toBeNull();
  });

  it('a workout deleted during the push is not purged and pushes as a tombstone next time', async () => {
    insertExercise('ex1');
    const d = await tree('done');
    mockUpsert.mockImplementationOnce(async () => ({ error: null })); // exercises
    mockUpsert.mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 5));
      await w.deleteWorkout(d.workout.id);
      return { error: null };
    });
    await run();
    expect(rowOf('workouts', d.workout.id)).toBeDefined();
    expect(rowOf('workouts', d.workout.id).synced_at).toBeNull();
    mockUpsert.mockReset().mockResolvedValue({ error: null });
    await run();
    expect(pushed('workouts')[0].deleted_at).toEqual(expect.any(String));
    expect(rowOf('workouts', d.workout.id)).toBeUndefined();
  });

  it('a pushed exercise tombstone still referenced by a workout stays locally; unreferenced ones are purged', async () => {
    insertExercise('used');
    insertExercise('unused');
    const d = await tree('done', 'used');
    mem.raw.prepare('UPDATE exercises SET deleted_at = ? WHERE id IN (?, ?)').run(T, 'used', 'unused');
    await run();
    expect(pushed('exercises').map((r) => r.id).sort()).toEqual(['unused', 'used']);
    expect(rowOf('exercises', 'unused')).toBeUndefined();
    expect(rowOf('exercises', 'used')).toMatchObject({ synced_at: expect.any(String) });
    const full = await w.getWorkoutWithExercises(d.workout.id);
    expect(full?.exercises[0].exercise_name).toBe('Ex used');
  });
});

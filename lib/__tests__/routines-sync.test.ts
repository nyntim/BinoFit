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
let routines: typeof import('@/lib/workouts/routines');

beforeEach(async () => {
  jest.resetModules();
  mockUpsert.mockReset().mockResolvedValue({ error: null });
  mem = createMemoryDb();
  const SQLite = require('expo-sqlite');
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  const database = require('@/lib/database');
  sync = require('@/lib/sync');
  w = require('@/lib/workouts/db');
  routines = require('@/lib/workouts/routines');
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
const rowOf = (table: string, id: string): any =>
  mem.raw.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
const pushed = (table: string): any[] =>
  mockUpsert.mock.calls.filter((c) => c[0] === table).flatMap((c) => c[1] as any[]);
const pushedRoutineTables = () =>
  mockUpsert.mock.calls.map((c) => c[0]).filter((t) => /routine/.test(t));

const run = async () => {
  try {
    await sync.syncToSupabase();
  } catch {
    /* per-step failures are reported, not asserted here */
  }
};

describe('routine sync', () => {
  it('pushes routines then routine_exercises, marks synced_at, and purges pushed tombstones', async () => {
    insertExercise('ex1');
    const r = await routines.createRoutine('Push');
    const c = await routines.addExerciseToRoutine(r.id, 'ex1');
    await run();

    expect(pushedRoutineTables()).toEqual(['routines', 'routine_exercises']);
    expect(pushed('routines')[0]).toMatchObject({
      id: r.id,
      user_id: 'uid',
      name: 'Push',
      deleted_at: null,
    });
    expect(pushed('routine_exercises')[0]).toMatchObject({
      id: c.id,
      user_id: 'uid',
      routine_id: r.id,
      exercise_id: 'ex1',
      deleted_at: null,
    });
    expect(rowOf('routines', r.id).synced_at).not.toBeNull();
    expect(rowOf('routine_exercises', c.id).synced_at).not.toBeNull();

    mockUpsert.mockClear();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await routines.deleteRoutine(r.id);
    await run();

    expect(pushedRoutineTables()).toEqual(['routines', 'routine_exercises']);
    expect(pushed('routines')[0].deleted_at).toEqual(expect.any(String));
    expect(pushed('routine_exercises')[0].deleted_at).toEqual(expect.any(String));
    expect(rowOf('routines', r.id)).toBeUndefined();
    expect(rowOf('routine_exercises', c.id)).toBeUndefined();
  });

  it('keeps a row edited during the push unsynced', async () => {
    insertExercise('ex1');
    const r = await routines.createRoutine('Push');
    const c = await routines.addExerciseToRoutine(r.id, 'ex1');
    mockUpsert.mockImplementation(async (t: string) => {
      if (t === 'routine_exercises') {
        mem.raw
          .prepare(
            "UPDATE routine_exercises SET set_count = 6, updated_at = '2999-01-01T00:00:00.000Z', synced_at = NULL WHERE id = ?"
          )
          .run(c.id);
      }
      return { error: null };
    });
    await run();
    expect(rowOf('routine_exercises', c.id).synced_at).toBeNull();

    mockUpsert.mockReset().mockResolvedValue({ error: null });
    await run();
    expect(pushed('routine_exercises')[0].set_count).toBe(6);
    expect(rowOf('routine_exercises', c.id).synced_at).not.toBeNull();
  });

  it('a failed child push keeps the child tombstone and purges it on the next successful push', async () => {
    insertExercise('ex1');
    const r = await routines.createRoutine('Push');
    const c = await routines.addExerciseToRoutine(r.id, 'ex1');
    await run();
    mockUpsert.mockClear();

    await new Promise((resolve) => setTimeout(resolve, 5));
    await routines.deleteRoutine(r.id);
    mockUpsert.mockImplementation(async (t: string) => ({
      error: t === 'routine_exercises' ? new Error('boom') : null,
    }));
    await run();
    expect(rowOf('routines', r.id)).toBeUndefined();
    expect(rowOf('routine_exercises', c.id)).toBeDefined();

    mockUpsert.mockReset().mockResolvedValue({ error: null });
    await run();
    expect(pushed('routine_exercises')[0]).toMatchObject({
      id: c.id,
      deleted_at: expect.any(String),
    });
    expect(rowOf('routine_exercises', c.id)).toBeUndefined();
  });

  it('does not push active or draft workouts while pushing unreferenced routines, and keeps exercise tombstones used by routines', async () => {
    insertExercise('ex1');
    const r = await routines.createRoutine('Solo Routine');
    await routines.addExerciseToRoutine(r.id, 'ex1');
    await w.createWorkout({ date: '2026-06-01', status: 'active' });
    await w.createWorkout({ date: '2026-06-01', status: 'draft' });
    mem.raw.prepare('UPDATE exercises SET deleted_at = ? WHERE id = ?').run(T, 'ex1');

    await run();
    expect(pushed('workouts')).toEqual([]);
    expect(pushed('routines').map((x) => x.id)).toEqual([r.id]);
    expect(rowOf('exercises', 'ex1')).toBeDefined();
  });
});

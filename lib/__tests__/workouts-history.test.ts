import { createMemoryDb } from '@/test-utils/sqlite-memory';

let mem: ReturnType<typeof createMemoryDb>;
let h: typeof import('@/lib/workouts/history');
let sum: typeof import('@/lib/workouts/summary');

beforeEach(async () => {
  mem = createMemoryDb();
  jest.resetModules();
  const SQLite = require('expo-sqlite');
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  await require('@/lib/database').getDatabase();
  h = require('@/lib/workouts/history');
  sum = require('@/lib/workouts/summary');
  mem.raw
    .prepare(
      `INSERT INTO exercises (id,name,log_type,equipment,source,created_at,updated_at)
       VALUES ('ex1','Bench','weight_reps','barbell','custom','2025-01-01','2025-01-01')`
    )
    .run();
});

let n = 0;
function add(over: { id?: string; status?: string; date: string; started_at?: string | null; deleted_at?: string | null; sets?: number }) {
  const id = over.id ?? `w${++n}`;
  const T = '2025-10-01T00:00:00.000Z';
  mem.raw
    .prepare(
      `INSERT INTO workouts (id,status,source,name,date,started_at,created_at,updated_at,deleted_at)
       VALUES (?,?,'live',NULL,?,?,?,?,?)`
    )
    .run(id, over.status ?? 'done', over.date, over.started_at ?? null, T, T, over.deleted_at ?? null);
  mem.raw
    .prepare(
      `INSERT INTO workout_exercises (id,workout_id,exercise_id,position,created_at,updated_at)
       VALUES (?,?,'ex1',0,?,?)`
    )
    .run(`${id}-l`, id, T, T);
  for (let i = 0; i < (over.sets ?? 1); i++) {
    mem.raw
      .prepare(
        `INSERT INTO workout_sets (id,workout_id,workout_exercise_id,position,set_type,weight_kg,reps,created_at,updated_at)
         VALUES (?,?,?,?,'normal',100,10,?,?)`
      )
      .run(`${id}-s${i}`, id, `${id}-l`, i, T, T);
  }
  return id;
}

describe('getDoneWorkoutsBetween', () => {
  it('includes both boundary dates and excludes outside dates', async () => {
    add({ id: 'before', date: '2025-10-12' });
    add({ id: 'mon', date: '2025-10-13' });
    add({ id: 'sun', date: '2025-10-19' });
    add({ id: 'after', date: '2025-10-20' });
    const r = await h.getDoneWorkoutsBetween('2025-10-13', '2025-10-19');
    expect(r.map((x) => x.id).sort()).toEqual(['mon', 'sun']);
  });

  it('a session started Sunday 23:50 and ended after midnight counts on its start date', async () => {
    add({ id: 'late', date: '2025-10-19', started_at: '2025-10-19T23:50:00.000Z' });
    mem.raw.prepare(`UPDATE workouts SET ended_at='2025-10-20T00:40:00.000Z' WHERE id='late'`).run();
    const thisWeek = await h.getDoneWorkoutsBetween('2025-10-13', '2025-10-19');
    const nextWeek = await h.getDoneWorkoutsBetween('2025-10-20', '2025-10-26');
    expect(thisWeek.map((x) => x.id)).toEqual(['late']);
    expect(nextWeek).toEqual([]);
  });

  it('excludes active, draft and tombstoned workouts', async () => {
    add({ id: 'done', date: '2025-10-14' });
    add({ id: 'act', date: '2025-10-14', status: 'active' });
    add({ id: 'dr', date: '2025-10-14', status: 'draft' });
    add({ id: 'del', date: '2025-10-14', deleted_at: '2025-10-15T00:00:00.000Z' });
    const r = await h.getDoneWorkoutsBetween('2025-10-13', '2025-10-19');
    expect(r.map((x) => x.id)).toEqual(['done']);
  });

  it('orders newest first by date then start time, and hydrates exercises and sets', async () => {
    add({ id: 'a', date: '2025-10-14', started_at: '2025-10-14T08:00:00.000Z', sets: 2 });
    add({ id: 'b', date: '2025-10-14', started_at: '2025-10-14T18:00:00.000Z' });
    add({ id: 'c', date: '2025-10-16' });
    const r = await h.getDoneWorkoutsBetween('2025-10-13', '2025-10-19');
    expect(r.map((x) => x.id)).toEqual(['c', 'b', 'a']);
    const a = r[2];
    expect(a.exercises).toHaveLength(1);
    expect(a.exercises[0].exercise?.name).toBe('Bench');
    expect(a.exercises[0].sets).toHaveLength(2);
    expect(sum.summarizeWeek(r).volumeKg).toBe(4000);
  });

  it('skips tombstoned sets and returns empty for no rows', async () => {
    add({ id: 'x', date: '2025-10-14', sets: 2 });
    mem.raw.prepare(`UPDATE workout_sets SET deleted_at='2025-10-15' WHERE id='x-s0'`).run();
    const r = await h.getDoneWorkoutsBetween('2025-10-13', '2025-10-19');
    expect(r[0].exercises[0].sets).toHaveLength(1);
    expect(await h.getDoneWorkoutsBetween('2030-01-01', '2030-01-07')).toEqual([]);
  });
});

describe('getRecentDoneWorkouts', () => {
  beforeEach(() => {
    for (let d = 1; d <= 5; d++) add({ id: `d${d}`, date: `2025-10-0${d}` });
    add({ id: 'act', date: '2025-10-09', status: 'active' });
    add({ id: 'dr', date: '2025-10-08', status: 'draft' });
    add({ id: 'del', date: '2025-10-07', deleted_at: '2025-10-08' });
  });

  it('returns done workouts newest first, ignoring active, draft and tombstoned', async () => {
    const r = await h.getRecentDoneWorkouts(10);
    expect(r.map((x) => x.id)).toEqual(['d5', 'd4', 'd3', 'd2', 'd1']);
  });

  it('pages with limit and offset', async () => {
    expect((await h.getRecentDoneWorkouts(2)).map((x) => x.id)).toEqual(['d5', 'd4']);
    expect((await h.getRecentDoneWorkouts(2, 2)).map((x) => x.id)).toEqual(['d3', 'd2']);
    expect((await h.getRecentDoneWorkouts(2, 4)).map((x) => x.id)).toEqual(['d1']);
    expect(await h.getRecentDoneWorkouts(2, 10)).toEqual([]);
  });
});

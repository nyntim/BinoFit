import { createMemoryDb } from '@/test-utils/sqlite-memory';

let mem: ReturnType<typeof createMemoryDb>;
let apply: typeof import('@/lib/workouts/restore-apply');
let routines: typeof import('@/lib/workouts/routines');

beforeEach(async () => {
  jest.resetModules();
  mem = createMemoryDb();
  const SQLite = require('expo-sqlite');
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  const database = require('@/lib/database');
  apply = require('@/lib/workouts/restore-apply');
  routines = require('@/lib/workouts/routines');
  await database.getDatabase();
});

const OLD = '2026-01-01T00:00:00.000Z';
const MID = '2026-03-01T00:00:00.000Z';
const NEW = '2026-06-01T00:00:00.000Z';

const rowOf = (table: string, id: string): any =>
  mem.raw.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
const count = (table: string): number =>
  (mem.raw.prepare(`SELECT COUNT(*) c FROM ${table}`).get() as any).c;

const rEx = (over: Record<string, any> = {}): any => ({
  id: 'ex1',
  user_id: 'u',
  name: 'Cable Row',
  log_type: 'weight_reps',
  primary_muscles: ['upper_back'],
  secondary_muscles: ['biceps'],
  equipment: 'cable',
  brand: null,
  load_type: null,
  base_weight_kg: null,
  per_side: false,
  setup_notes: null,
  default_rest_seconds: null,
  met: null,
  source: 'custom',
  hidden: false,
  created_at: OLD,
  updated_at: MID,
  deleted_at: null,
  ...over,
});

const rRoutine = (over: Record<string, any> = {}): any => ({
  id: 'r1',
  user_id: 'u',
  name: 'Pull',
  position: 0,
  created_at: OLD,
  updated_at: MID,
  deleted_at: null,
  ...over,
});

const rRoutineEx = (over: Record<string, any> = {}): any => ({
  id: 're1',
  user_id: 'u',
  routine_id: 'r1',
  exercise_id: 'ex1',
  position: 0,
  set_count: 3,
  rest_seconds: 90,
  created_at: OLD,
  updated_at: MID,
  deleted_at: null,
  ...over,
});

describe('applyRemoteRoutines', () => {
  it('inserts routines and children marked synced, skips older or tied remotes, and upserts newer', async () => {
    expect(
      await apply.applyRemoteRoutines({
        routines: [rRoutine()],
        routineExercises: [rRoutineEx()],
      })
    ).toBe(1);
    expect(rowOf('routines', 'r1')).toMatchObject({
      name: 'Pull',
      synced_at: expect.any(String),
      deleted_at: null,
    });
    expect(rowOf('routine_exercises', 're1')).toMatchObject({
      set_count: 3,
      rest_seconds: 90,
      synced_at: expect.any(String),
    });

    // Older remote skipped
    expect(
      await apply.applyRemoteRoutines({
        routines: [rRoutine({ name: 'Older', updated_at: OLD })],
        routineExercises: [],
      })
    ).toBe(0);
    expect(rowOf('routines', 'r1').name).toBe('Pull');

    // Tie keeps local
    expect(
      await apply.applyRemoteRoutines({
        routines: [rRoutine({ name: 'Tie', updated_at: MID })],
        routineExercises: [],
      })
    ).toBe(0);
    expect(rowOf('routines', 'r1').name).toBe('Pull');

    // Newer remote upserts
    expect(
      await apply.applyRemoteRoutines({
        routines: [rRoutine({ name: 'Pull B', updated_at: NEW })],
        routineExercises: [rRoutineEx({ set_count: 5, updated_at: NEW })],
      })
    ).toBe(1);
    expect(rowOf('routines', 'r1').name).toBe('Pull B');
    expect(rowOf('routine_exercises', 're1').set_count).toBe(5);
  });

  it('newer remote tombstone deletes the routine and its local children; tombstone with no local row is skipped', async () => {
    expect(
      await apply.applyRemoteRoutines({
        routines: [rRoutine({ deleted_at: MID })],
        routineExercises: [rRoutineEx({ deleted_at: MID })],
      })
    ).toBe(0);
    expect(count('routines') + count('routine_exercises')).toBe(0);

    await apply.applyRemoteRoutines({
      routines: [rRoutine()],
      routineExercises: [rRoutineEx()],
    });
    expect(
      await apply.applyRemoteRoutines({
        routines: [rRoutine({ updated_at: NEW, deleted_at: NEW })],
        routineExercises: [],
      })
    ).toBe(0);
    expect(count('routines') + count('routine_exercises')).toBe(0);
  });

  it('skips a child whose parent routine is not live locally', async () => {
    await apply.applyRemoteRoutines({
      routines: [rRoutine({ deleted_at: MID })],
      routineExercises: [rRoutineEx()],
    });
    expect(count('routine_exercises')).toBe(0);

    await apply.applyRemoteRoutines({
      routines: [],
      routineExercises: [rRoutineEx()],
    });
    expect(count('routine_exercises')).toBe(0);
  });

  it('keeps a deleted custom exercise referenced by a restored routine as a tombstone and never overwrites a seed row', async () => {
    await apply.applyRemoteExercises([rEx({ deleted_at: MID })], ['ex1']);
    await apply.applyRemoteRoutines({
      routines: [rRoutine()],
      routineExercises: [rRoutineEx()],
    });
    const full = await routines.getRoutineWithExercises('r1');
    expect(full?.exercises[0].exercise_name).toBe('Cable Row');

    mem.raw
      .prepare(
        `INSERT INTO exercises (id,name,log_type,equipment,source,created_at,updated_at)
         VALUES ('seed-ex','Seed Squat','weight_reps','barbell','seed',?,?)`
      )
      .run(OLD, OLD);
    expect(
      await apply.applyRemoteExercises([rEx({ id: 'seed-ex', name: 'Overwritten', updated_at: NEW })])
    ).toBe(0);
    expect(rowOf('exercises', 'seed-ex').name).toBe('Seed Squat');
  });
});

import { createMemoryDb } from '@/test-utils/sqlite-memory';

let mem: ReturnType<typeof createMemoryDb>;
let rh: typeof import('@/lib/workouts/record-history');

const T = '2026-01-01T00:00:00.000Z';

beforeEach(async () => {
  mem = createMemoryDb();
  jest.resetModules();
  const SQLite = require('expo-sqlite');
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  await require('@/lib/database').getDatabase();
  rh = require('@/lib/workouts/record-history');

  mem.raw
    .prepare(
      `INSERT INTO exercises (id,name,log_type,per_side,equipment,source,created_at,updated_at,deleted_at)
       VALUES
         ('ex1','Bench','weight_reps',0,'barbell','custom',?,?,NULL),
         ('ex2','DB Row','weight_reps',1,'dumbbell','custom',?,?,NULL),
         ('exDel','Deleted Custom','weight_reps',0,'barbell','custom',?,?,'2026-01-05T00:00:00.000Z'),
         ('exBw','Pull-up','bodyweight_reps',0,'bodyweight','custom',?,?,NULL)`
    )
    .run(T, T, T, T, T, T, T, T);
});

let seq = 0;
function insertSetFixture(opts: {
  workoutId?: string;
  exerciseId?: string;
  status?: string;
  startedAt?: string | null;
  createdAt?: string;
  workoutDeletedAt?: string | null;
  linkDeletedAt?: string | null;
  setDeletedAt?: string | null;
  setType?: string;
  weightKg?: number | null;
  reps?: number | null;
  completedAt?: string | null;
  position?: number;
}) {
  const n = ++seq;
  const wId = opts.workoutId ?? `w${n}`;
  const lId = `l${n}`;
  const sId = `s${n}`;
  const createdAt = opts.createdAt ?? '2026-01-02T10:00:00.000Z';
  const startedAt = opts.startedAt !== undefined ? opts.startedAt : '2026-01-02T10:00:00.000Z';

  const existingWorkout = mem.raw.prepare('SELECT id FROM workouts WHERE id = ?').get(wId);
  if (!existingWorkout) {
    mem.raw
      .prepare(
        `INSERT INTO workouts (id,status,source,name,date,started_at,created_at,updated_at,deleted_at)
         VALUES (?,?,'live',NULL,'2026-01-02',?,?,?,?)`
      )
      .run(wId, opts.status ?? 'done', startedAt, createdAt, createdAt, opts.workoutDeletedAt ?? null);
  }

  mem.raw
    .prepare(
      `INSERT INTO workout_exercises (id,workout_id,exercise_id,position,created_at,updated_at,deleted_at)
       VALUES (?,?,?,0,?,?,?)`
    )
    .run(lId, wId, opts.exerciseId ?? 'ex1', createdAt, createdAt, opts.linkDeletedAt ?? null);

  mem.raw
    .prepare(
      `INSERT INTO workout_sets (id,workout_id,workout_exercise_id,position,set_type,weight_kg,reps,completed_at,created_at,updated_at,deleted_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      sId,
      wId,
      lId,
      opts.position ?? 0,
      opts.setType ?? 'normal',
      opts.weightKg !== undefined ? opts.weightKg : 100,
      opts.reps !== undefined ? opts.reps : 5,
      opts.completedAt !== undefined ? opts.completedAt : '2026-01-02T10:05:00.000Z',
      createdAt,
      createdAt,
      opts.setDeletedAt ?? null
    );

  return { wId, lId, sId };
}

describe('getPriorRecordSets', () => {
  const BEFORE = '2026-01-10T00:00:00.000Z';

  it('returns [] when exerciseIds is empty', async () => {
    insertSetFixture({ exerciseId: 'ex1' });
    expect(await rh.getPriorRecordSets([], { excludeWorkoutId: 'current', before: BEFORE })).toEqual([]);
  });

  it('returns eligible sets for multiple exercise ids in one call and maps perSide', async () => {
    const s1 = insertSetFixture({ exerciseId: 'ex1', weightKg: 100, reps: 5 });
    const s2 = insertSetFixture({ exerciseId: 'ex2', weightKg: 35, reps: 8 });

    const res = await rh.getPriorRecordSets(['ex1', 'ex2'], {
      excludeWorkoutId: 'current',
      before: BEFORE,
    });
    expect(res.map((r) => r.setId)).toEqual([s1.sId, s2.sId]);
    expect(res[0].perSide).toBe(false);
    expect(res[1].perSide).toBe(true);
  });

  it('includes sets from a tombstoned custom exercise row', async () => {
    const s = insertSetFixture({ exerciseId: 'exDel', weightKg: 90, reps: 6 });
    const res = await rh.getPriorRecordSets(['exDel'], {
      excludeWorkoutId: 'current',
      before: BEFORE,
    });
    expect(res.map((r) => r.setId)).toEqual([s.sId]);
  });

  it('excludes warmup, unticked, active/draft, tombstoned, non-weight_reps, non-positive, excluded workout, and workouts not strictly before cutoff', async () => {
    const valid = insertSetFixture({
      workoutId: 'w-valid',
      exerciseId: 'ex1',
      startedAt: '2026-01-05T10:00:00.000Z',
      weightKg: 100,
      reps: 5,
    });

    // Warmup
    insertSetFixture({ exerciseId: 'ex1', setType: 'warmup' });
    // completed_at null
    insertSetFixture({ exerciseId: 'ex1', completedAt: null });
    // status active & draft
    insertSetFixture({ exerciseId: 'ex1', status: 'active' });
    insertSetFixture({ exerciseId: 'ex1', status: 'draft' });
    // tombstoned set, link, workout
    insertSetFixture({ exerciseId: 'ex1', setDeletedAt: '2026-01-03T00:00:00.000Z' });
    insertSetFixture({ exerciseId: 'ex1', linkDeletedAt: '2026-01-03T00:00:00.000Z' });
    insertSetFixture({ exerciseId: 'ex1', workoutDeletedAt: '2026-01-03T00:00:00.000Z' });
    // non-weight_reps
    insertSetFixture({ exerciseId: 'exBw', weightKg: 20, reps: 10 });
    // excluded workout id
    insertSetFixture({ workoutId: 'w-excluded', exerciseId: 'ex1' });
    // started_at equal to before (not strictly before)
    insertSetFixture({ exerciseId: 'ex1', startedAt: BEFORE });
    // started_at after before
    insertSetFixture({ exerciseId: 'ex1', startedAt: '2026-01-11T00:00:00.000Z' });
    // weight_kg <= 0 or reps <= 0
    insertSetFixture({ exerciseId: 'ex1', weightKg: 0, reps: 5 });
    insertSetFixture({ exerciseId: 'ex1', weightKg: 100, reps: 0 });

    const res = await rh.getPriorRecordSets(['ex1', 'exBw'], {
      excludeWorkoutId: 'w-excluded',
      before: BEFORE,
    });
    expect(res.map((r) => r.setId)).toEqual([valid.sId]);
  });
});

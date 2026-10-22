import {
  formatRecordValue,
  formatSessionsPerWeek,
  recentRecords,
  recordKindLabel,
  sessionBarScale,
  trainingAverages,
  trainingBuckets,
} from '@/lib/workouts/progress';
import { estimatedOneRepMax } from '@/lib/workouts/records';
import type {
  Exercise,
  ExerciseLogType,
  SetType,
  WorkoutExerciseWithSets,
  WorkoutSet,
  WorkoutStatus,
  WorkoutWithExercises,
} from '@/lib/types';

let seq = 0;

function makeExercise(over: Partial<Exercise> = {}): Exercise {
  seq += 1;
  return {
    id: over.id ?? `ex-${seq}`,
    name: over.name ?? 'Bench Press',
    log_type: over.log_type ?? 'weight_reps',
    primary_muscles: over.primary_muscles ?? ['chest'],
    secondary_muscles: over.secondary_muscles ?? [],
    equipment: over.equipment ?? 'barbell',
    brand: over.brand ?? null,
    load_type: over.load_type ?? null,
    base_weight_kg: over.base_weight_kg ?? null,
    per_side: over.per_side ?? 0,
    setup_notes: over.setup_notes ?? null,
    default_rest_seconds: over.default_rest_seconds ?? null,
    met: over.met ?? null,
    source: over.source ?? 'seed',
    hidden: over.hidden ?? 0,
    created_at: over.created_at ?? '2026-01-01T00:00:00.000Z',
    updated_at: over.updated_at ?? '2026-01-01T00:00:00.000Z',
    deleted_at: over.deleted_at ?? null,
  };
}

type SetOverrides = {
  id?: string;
  workoutId?: string;
  workoutExerciseId?: string;
  position?: number;
  set_type?: SetType;
  weight_kg?: number | null;
  reps?: number | null;
  completed_at?: string | null;
  deleted_at?: string | null;
};

function makeSet(over: SetOverrides = {}): WorkoutSet {
  seq += 1;
  return {
    id: over.id ?? `set-${seq}`,
    workout_id: over.workoutId ?? 'w1',
    workout_exercise_id: over.workoutExerciseId ?? 'we1',
    position: over.position ?? 0,
    set_type: over.set_type ?? 'normal',
    weight_kg: over.weight_kg !== undefined ? over.weight_kg : 100,
    reps: over.reps !== undefined ? over.reps : 5,
    duration_seconds: null,
    distance_m: null,
    rpe: null,
    rir: null,
    completed_at:
      over.completed_at !== undefined ? over.completed_at : '2026-10-10T10:05:00.000Z',
    created_at: '2026-10-10T10:00:00.000Z',
    updated_at: '2026-10-10T10:00:00.000Z',
    deleted_at: over.deleted_at ?? null,
  };
}

function makeWorkout(over: {
  id?: string;
  date: string;
  status?: WorkoutStatus;
  started_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  created_at?: string;
  deleted_at?: string | null;
  exercises?: {
    exercise?: Exercise | null;
    exercise_id?: string;
    exercise_name?: string;
    deleted_at?: string | null;
    sets: SetOverrides[];
  }[];
}): WorkoutWithExercises {
  seq += 1;
  const workoutId = over.id ?? `w-${seq}`;
  const created = over.created_at ?? `${over.date}T10:00:00.000Z`;
  const exercises: WorkoutExerciseWithSets[] = (over.exercises ?? []).map((item, ei) => {
    const ex = item.exercise !== undefined ? item.exercise : makeExercise({ id: item.exercise_id ?? `ex-${ei}` });
    const weId = `${workoutId}-we-${ei}`;
    const exId = item.exercise_id ?? ex?.id ?? `ex-${ei}`;
    return {
      id: weId,
      workout_id: workoutId,
      exercise_id: exId,
      position: ei,
      rest_seconds: null,
      notes: null,
      created_at: created,
      updated_at: created,
      deleted_at: item.deleted_at ?? null,
      exercise_name: item.exercise_name ?? ex?.name ?? 'Unknown exercise',
      exercise: ex,
      sets: item.sets.map((s, si) =>
        makeSet({
          ...s,
          workoutId,
          workoutExerciseId: weId,
          position: s.position ?? si,
        })
      ),
    };
  });

  return {
    id: workoutId,
    status: over.status ?? 'done',
    source: 'live',
    name: null,
    date: over.date,
    started_at: over.started_at !== undefined ? over.started_at : created,
    ended_at: over.ended_at ?? null,
    duration_seconds: over.duration_seconds !== undefined ? over.duration_seconds : 3600,
    notes: null,
    routine_id: null,
    created_at: created,
    updated_at: created,
    deleted_at: over.deleted_at ?? null,
    exercises,
  };
}

describe('trainingBuckets', () => {
  it('includes empty days and sums sessions and workoutVolumeKg (ignoring warmups and doubling per-side)', () => {
    const barbell = makeExercise({ id: 'bb', log_type: 'weight_reps', per_side: 0 });
    const dbRow = makeExercise({ id: 'db', log_type: 'weight_reps', per_side: 1 });

    const w1 = makeWorkout({
      date: '2026-10-16',
      exercises: [
        {
          exercise: barbell,
          sets: [
            { set_type: 'warmup', weight_kg: 60, reps: 10 }, // 0
            { set_type: 'normal', weight_kg: 100, reps: 5 }, // 500
          ],
        },
      ],
    });
    const w2 = makeWorkout({
      date: '2026-10-16',
      exercises: [
        {
          exercise: dbRow,
          sets: [
            { set_type: 'normal', weight_kg: 30, reps: 10 }, // 30 * 10 * 2 = 600
          ],
        },
      ],
    });

    const buckets = trainingBuckets('2026-10-15', '2026-10-17', 'day', [w1, w2]);
    expect(buckets).toEqual([
      {
        key: '2026-10-15',
        start: '2026-10-15',
        end: '2026-10-15',
        unit: 'day',
        sessions: 0,
        volumeKg: 0,
        hasData: false,
        isCurrent: false,
      },
      {
        key: '2026-10-16',
        start: '2026-10-16',
        end: '2026-10-16',
        unit: 'day',
        sessions: 2,
        volumeKg: 1100,
        hasData: true,
        isCurrent: false,
      },
      {
        key: '2026-10-17',
        start: '2026-10-17',
        end: '2026-10-17',
        unit: 'day',
        sessions: 0,
        volumeKg: 0,
        hasData: false,
        isCurrent: true,
      },
    ]);
  });

  it('places Sunday in the previous Monday week, ignores outside workouts, includes today, and marks only the last bucket current', () => {
    // 2026-10-11 is Sunday (week of Mon 2026-10-05); 2026-10-12 is Monday.
    const outside = makeWorkout({ date: '2026-10-01' });
    const sun = makeWorkout({ date: '2026-10-11' });
    const todayWorkout = makeWorkout({ date: '2026-10-17' });

    const buckets = trainingBuckets('2026-10-10', '2026-10-17', 'week', [
      outside,
      sun,
      todayWorkout,
    ]);
    expect(buckets.map((b) => [b.key, b.sessions, b.isCurrent])).toEqual([
      ['2026-10-05', 1, false],
      ['2026-10-12', 1, true],
    ]);
  });

  it('splits months on the boundary', () => {
    const sep = makeWorkout({ date: '2026-09-30' });
    const oct = makeWorkout({ date: '2026-10-01' });
    const buckets = trainingBuckets('2026-09-29', '2026-10-02', 'month', [sep, oct]);
    expect(buckets.map((b) => [b.key, b.sessions, b.isCurrent])).toEqual([
      ['2026-09-01', 1, false],
      ['2026-10-01', 1, true],
    ]);
  });
});

describe('trainingAverages, formatSessionsPerWeek, and sessionBarScale', () => {
  it('computes sessions per week with the 1-week floor and returns null when empty', () => {
    const w = (n: number) =>
      Array.from({ length: n }, (_, i) => makeWorkout({ date: `2026-10-0${(i % 9) + 1}` }));

    const avg7 = trainingAverages(w(3), 7)!;
    expect(avg7.sessionsPerWeek).toBe(3);
    expect(formatSessionsPerWeek(avg7.sessionsPerWeek)).toBe('3');

    const avg30 = trainingAverages(w(8), 30)!;
    expect(formatSessionsPerWeek(avg30.sessionsPerWeek)).toBe('1.9');

    const avg90 = trainingAverages(w(1), 90)!;
    expect(formatSessionsPerWeek(avg90.sessionsPerWeek)).toBe('0.1');

    const avgAll1 = trainingAverages(w(1), 1)!;
    expect(avgAll1.sessionsPerWeek).toBe(1);
    expect(formatSessionsPerWeek(avgAll1.sessionsPerWeek)).toBe('1');

    const avgAll3 = trainingAverages(w(1), 3)!;
    expect(avgAll3.sessionsPerWeek).toBe(1);
    expect(formatSessionsPerWeek(avgAll3.sessionsPerWeek)).toBe('1');

    expect(trainingAverages([], 7)).toBeNull();
  });

  it('averages durations and counts a null duration as 0', () => {
    const a = makeWorkout({ date: '2026-10-15', duration_seconds: 60 });
    const b = makeWorkout({ date: '2026-10-16', duration_seconds: 120 });
    expect(trainingAverages([a, b], 7)?.averageDurationSeconds).toBe(90);

    const c = makeWorkout({
      date: '2026-10-17',
      duration_seconds: null,
      started_at: null,
      ended_at: null,
    });
    expect(trainingAverages([a, b, c], 7)?.averageDurationSeconds).toBe(60);
  });

  it('formats sessions per week and keeps sessionBarScale as a small integer floored at 1', () => {
    expect(formatSessionsPerWeek(3)).toBe('3');
    expect(formatSessionsPerWeek(1.866666)).toBe('1.9');
    expect(sessionBarScale([2])).toBe(2);
    expect(sessionBarScale([1])).toBe(1);
    expect(sessionBarScale([0, 0])).toBe(1);
    expect(sessionBarScale([])).toBe(1);
  });
});

describe('recentRecords', () => {
  const bench = makeExercise({ id: 'bench', name: 'Bench Press', log_type: 'weight_reps' });

  it('ignores non-done, tombstoned, and non-weight_reps workouts', () => {
    const active = makeWorkout({
      date: '2026-10-15',
      status: 'active',
      exercises: [{ exercise: bench, sets: [{ weight_kg: 100, reps: 5 }] }],
    });
    const draft = makeWorkout({
      date: '2026-10-15',
      status: 'draft',
      exercises: [{ exercise: bench, sets: [{ weight_kg: 100, reps: 5 }] }],
    });
    const deleted = makeWorkout({
      date: '2026-10-15',
      deleted_at: '2026-10-16T00:00:00.000Z',
      exercises: [{ exercise: bench, sets: [{ weight_kg: 100, reps: 5 }] }],
    });
    const cardioEx = makeExercise({
      id: 'run',
      name: 'Run',
      log_type: 'distance_duration' as ExerciseLogType,
    });
    const cardio = makeWorkout({
      date: '2026-10-15',
      exercises: [{ exercise: cardioEx, sets: [{ weight_kg: 100, reps: 5 }] }],
    });

    expect(recentRecords([active, draft, deleted, cardio])).toEqual([]);
  });

  it('keeps earlier best when a later set is lighter or equal, and drops beaten marks', () => {
    const w1 = makeWorkout({
      id: 'w1',
      date: '2026-10-01',
      exercises: [{ exercise: bench, sets: [{ weight_kg: 100, reps: 5 }] }],
    });
    // w2 beats weight (110 > 100), e1rm, and volume (550 > 500), ties reps (5 === 5)
    const w2 = makeWorkout({
      id: 'w2',
      date: '2026-10-05',
      exercises: [{ exercise: bench, sets: [{ weight_kg: 110, reps: 5 }] }],
    });
    // w3 is lighter (90 < 110) and equal reps (5)
    const w3 = makeWorkout({
      id: 'w3',
      date: '2026-10-10',
      exercises: [{ exercise: bench, sets: [{ weight_kg: 90, reps: 5 }] }],
    });
    // w4 ties w2's 110 x 5
    const w4 = makeWorkout({
      id: 'w4',
      date: '2026-10-12',
      exercises: [{ exercise: bench, sets: [{ weight_kg: 110, reps: 5 }] }],
    });

    const forward = recentRecords([w1, w2, w3, w4], 10);
    const reversed = recentRecords([w4, w2, w1, w3], 10);
    expect(reversed).toEqual(forward);

    // Standing records for bench: weight=110 (w2), e1rm (w2), volume=550 (w2), reps=5 (w1, since w2 tied reps!)
    const weightRec = forward.find((r) => r.kind === 'weight')!;
    expect(weightRec).toMatchObject({
      workoutId: 'w2',
      date: '2026-10-05',
      valueKg: 110,
      exerciseName: 'Bench Press',
    });
    // w1's beaten 100 kg weight mark is absent
    expect(forward.filter((r) => r.kind === 'weight')).toHaveLength(1);

    // Equal reps (5) kept the earlier workout w1
    const repsRec = forward.find((r) => r.kind === 'reps')!;
    expect(repsRec).toMatchObject({
      workoutId: 'w1',
      date: '2026-10-01',
      reps: 5,
    });
  });

  it('orders newest workout first and caps at 5 by default', () => {
    const workouts = Array.from({ length: 6 }, (_, i) => {
      const ex = makeExercise({ id: `ex-${i}`, name: `Lift ${i}`, log_type: 'weight_reps' });
      const day = String(i + 1).padStart(2, '0');
      return makeWorkout({
        id: `w-${i}`,
        date: `2026-10-${day}`,
        exercises: [{ exercise: ex, sets: [{ weight_kg: 50 + i * 10, reps: 5 }] }],
      });
    });

    const top5 = recentRecords(workouts);
    expect(top5).toHaveLength(5);
    expect(top5[0].date).toBe('2026-10-06');
    for (let i = 1; i < top5.length; i++) {
      expect(top5[i - 1].date >= top5[i].date).toBe(true);
    }
  });

  it('respects records.ts e1RM 12-rep cap so 13 reps does not outrank 12 at the same weight', () => {
    expect(estimatedOneRepMax(100, 12)).not.toBeNull();
    expect(estimatedOneRepMax(100, 13)).toBeNull();

    const w12 = makeWorkout({
      id: 'w12',
      date: '2026-10-01',
      exercises: [{ exercise: bench, sets: [{ weight_kg: 100, reps: 12 }] }],
    });
    const w13 = makeWorkout({
      id: 'w13',
      date: '2026-10-05',
      exercises: [{ exercise: bench, sets: [{ weight_kg: 100, reps: 13 }] }],
    });

    const recs = recentRecords([w12, w13], 10);
    const e1rm = recs.find((r) => r.kind === 'e1rm')!;
    expect(e1rm.workoutId).toBe('w12');
    expect(e1rm.valueKg).toBeCloseTo(estimatedOneRepMax(100, 12)!, 10);
  });

  it('formats kind labels and values', () => {
    expect(recordKindLabel('weight')).toBe('Heaviest');
    expect(recordKindLabel('e1rm')).toBe('Estimated 1RM');
    expect(recordKindLabel('volume')).toBe('Set volume');
    expect(recordKindLabel('reps')).toBe('Most reps');

    expect(formatRecordValue({ kind: 'weight', value: 100 }, 'kg')).toBe('100 kg');
    expect(formatRecordValue({ kind: 'volume', value: 1200 }, 'kg')).toBe('1,200 kg');
    expect(formatRecordValue({ kind: 'reps', value: 8 }, 'kg')).toBe('8 reps');
  });
});

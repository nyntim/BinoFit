import {
  bestNewRecords,
  countRecordExercises,
  formatRecordCount,
  formatSetRecordNote,
  hasBeaten,
  workoutRecords,
  collectRecordHits,
  computeRecords,
  EMPTY_RECORDS,
  estimatedOneRepMax,
  formatRecordSummary,
  newRecordsFor,
  recentRecordHits,
  recordSetFromWorkoutSet,
  recordsByExercise,
  recordValues,
  type RecordSet,
} from '@/lib/workouts/records';
import type { WorkoutSet, WorkoutWithExercises } from '@/lib/types';

function makeSet(overrides: Partial<RecordSet> = {}): RecordSet {
  return {
    setId: 's1',
    workoutId: 'w1',
    exerciseId: 'bench',
    at: '2026-01-01T10:00:00.000Z',
    position: 0,
    weightKg: 100,
    reps: 5,
    setType: 'normal',
    completedAt: '2026-01-01T10:05:00.000Z',
    logType: 'weight_reps',
    perSide: false,
    ...overrides,
  };
}

describe('estimatedOneRepMax', () => {
  it('returns weightKg for 1 rep and Epley formula up to 12 reps', () => {
    expect(estimatedOneRepMax(100, 1)).toBe(100);
    expect(estimatedOneRepMax(100, 5)).toBeCloseTo(100 * (1 + 5 / 30), 10);
    expect(estimatedOneRepMax(100, 12)).toBeCloseTo(100 * (1 + 12 / 30), 10);
  });

  it('returns null for >12 reps, non-positive values, or non-finite inputs', () => {
    expect(estimatedOneRepMax(100, 13)).toBeNull();
    expect(estimatedOneRepMax(100, 0)).toBeNull();
    expect(estimatedOneRepMax(0, 5)).toBeNull();
    expect(estimatedOneRepMax(-1, 5)).toBeNull();
    expect(estimatedOneRepMax(NaN, 5)).toBeNull();
    expect(estimatedOneRepMax(100, NaN)).toBeNull();
    expect(estimatedOneRepMax(Infinity, 5)).toBeNull();
  });
});

describe('recordValues and eligibility', () => {
  it('returns all nulls and no new records for ineligible sets', () => {
    const cases: Partial<RecordSet>[] = [
      { setType: 'warmup' },
      { completedAt: null },
      { logType: 'bodyweight_reps' },
      { logType: 'assisted' },
      { logType: 'duration' },
      { logType: 'distance_duration' },
      { logType: null },
      { weightKg: 0 },
      { weightKg: -10 },
      { weightKg: null },
      { reps: 0 },
      { reps: -1 },
      { reps: null },
    ];
    for (const c of cases) {
      const s = makeSet(c);
      expect(recordValues(s)).toEqual(EMPTY_RECORDS);
      expect(newRecordsFor(s, EMPTY_RECORDS)).toEqual([]);
    }
  });

  it('counts drop and failure sets', () => {
    expect(recordValues(makeSet({ setType: 'drop', weightKg: 80, reps: 8 })).weightKg).toBe(80);
    expect(recordValues(makeSet({ setType: 'failure', weightKg: 90, reps: 6 })).weightKg).toBe(90);
  });

  it('sets weight, volume, and reps when reps > 12 while keeping e1rmKg null', () => {
    const v = recordValues(makeSet({ weightKg: 60, reps: 15 }));
    expect(v).toEqual({
      weightKg: 60,
      e1rmKg: null,
      volumeKg: 900,
      reps: 15,
    });
    expect(newRecordsFor(makeSet({ weightKg: 60, reps: 15 }), EMPTY_RECORDS)).toEqual([
      'weight',
      'volume',
      'reps',
    ]);
  });

  it('keeps heaviest as logged weight and doubles volume for per-side sets', () => {
    const v = recordValues(makeSet({ weightKg: 20, reps: 10, perSide: true }));
    expect(v.weightKg).toBe(20);
    expect(v.e1rmKg).toBeCloseTo(20 * (1 + 10 / 30), 10);
    expect(v.volumeKg).toBe(400);
    expect(v.reps).toBe(10);
  });

  it('maps WorkoutSet via recordSetFromWorkoutSet', () => {
    const ws: WorkoutSet = {
      id: 'ws-1',
      workout_id: 'w-1',
      workout_exercise_id: 'we-1',
      position: 2,
      set_type: 'normal',
      weight_kg: 100,
      reps: 5,
      duration_seconds: null,
      distance_m: null,
      rpe: 8,
      rir: null,
      completed_at: '2026-01-01T10:00:00.000Z',
      created_at: '2026-01-01T10:00:00.000Z',
      updated_at: '2026-01-01T10:00:00.000Z',
    };
    const rs = recordSetFromWorkoutSet({
      set: ws,
      exerciseId: 'bench',
      at: '2026-01-01T09:30:00.000Z',
      logType: 'weight_reps',
      perSide: true,
    });
    expect(rs).toEqual({
      setId: 'ws-1',
      workoutId: 'w-1',
      exerciseId: 'bench',
      at: '2026-01-01T09:30:00.000Z',
      position: 2,
      weightKg: 100,
      reps: 5,
      setType: 'normal',
      completedAt: '2026-01-01T10:00:00.000Z',
      logType: 'weight_reps',
      perSide: true,
    });
  });
});

describe('computeRecords, recordsByExercise, newRecordsFor, and bestNewRecords', () => {
  it('returns all available kinds for the first set against EMPTY_RECORDS', () => {
    const first = makeSet({ weightKg: 100, reps: 5 });
    expect(newRecordsFor(first, EMPTY_RECORDS)).toEqual(['weight', 'e1rm', 'volume', 'reps']);
  });

  it('returns only strictly beaten kinds and excludes ties', () => {
    const prior = computeRecords([makeSet({ weightKg: 100, reps: 5 })]);
    // Exact tie: none
    expect(newRecordsFor(makeSet({ weightKg: 100, reps: 5 }), prior)).toEqual([]);
    // Equal volume (50 * 10 = 500), higher reps (10 > 5), lower weight (50 < 100), lower e1RM
    expect(newRecordsFor(makeSet({ weightKg: 50, reps: 10 }), prior)).toEqual(['reps']);
    // Higher weight (105 > 100) and e1RM, lower reps (1 < 5) and volume (105 < 500)
    expect(newRecordsFor(makeSet({ weightKg: 105, reps: 1 }), prior)).toEqual(['weight']);
  });

  it('groups records by exerciseId', () => {
    const map = recordsByExercise([
      makeSet({ exerciseId: 'bench', weightKg: 100, reps: 5 }),
      makeSet({ exerciseId: 'squat', weightKg: 140, reps: 3 }),
    ]);
    expect(map.get('bench')?.weightKg).toBe(100);
    expect(map.get('squat')?.weightKg).toBe(140);
  });

  it('bestNewRecords picks the max per kind across sets and nulls kinds that only tie prior', () => {
    const prior = computeRecords([makeSet({ weightKg: 100, reps: 8 })]); // volume 800, e1rm 126.67
    const sets = [
      makeSet({ setId: 'a', weightKg: 100, reps: 8 }), // ties everything
      makeSet({ setId: 'b', weightKg: 110, reps: 5 }), // beats weight (110), e1rm (128.33), volume 550 < 800
      makeSet({ setId: 'c', weightKg: 115, reps: 3 }), // beats weight (115), e1rm (126.5 < 126.67)
    ];
    const best = bestNewRecords(sets, prior);
    expect(best.weightKg).toBe(115);
    expect(best.e1rmKg).toBeCloseTo(110 * (1 + 5 / 30), 10);
    expect(best.volumeKg).toBeNull();
    expect(best.reps).toBeNull();
  });
});

describe('formatRecordSummary', () => {
  it('returns null when nothing was beaten', () => {
    expect(formatRecordSummary(EMPTY_RECORDS, 'kg', false)).toBeNull();
  });

  it('formats heaviest only', () => {
    expect(
      formatRecordSummary({ weightKg: 100, e1rmKg: null, volumeKg: null, reps: null }, 'kg', false)
    ).toBe('PR · Heaviest 100 kg');
  });

  it('formats all four kinds in order with /side on weight, e1RM, and reps but not volume', () => {
    const e1rm = 100 * (1 + 5 / 30); // 116.666... -> 116.67
    expect(
      formatRecordSummary(
        { weightKg: 30, e1rmKg: e1rm, volumeKg: 1200, reps: 12 },
        'kg',
        true
      )
    ).toBe(
      'PR · Heaviest 30 kg/side · Estimated 1RM 116.67 kg/side · Best set 1,200 kg · Most reps 12/side'
    );
  });
});

describe('collectRecordHits and recentRecordHits', () => {
  it('emits hits when sets strictly beat running best and recomputes cleanly after edits or deletes', () => {
    const a = makeSet({
      setId: 'sA',
      workoutId: 'wA',
      at: '2026-01-01T10:00:00.000Z',
      weightKg: 100,
      reps: 5,
    });
    const b = makeSet({
      setId: 'sB',
      workoutId: 'wB',
      at: '2026-01-08T10:00:00.000Z',
      weightKg: 110,
      reps: 5,
    });
    const tie = makeSet({
      setId: 'sC',
      workoutId: 'wC',
      at: '2026-01-15T10:00:00.000Z',
      weightKg: 110,
      reps: 5,
    });

    const weightHits1 = collectRecordHits([a, b, tie]).filter((h) => h.kind === 'weight');
    expect(weightHits1.map((h) => ({ workoutId: h.workoutId, value: h.value }))).toEqual([
      { workoutId: 'wA', value: 100 },
      { workoutId: 'wB', value: 110 },
    ]);

    // Replace A's weight with 120 and recompute: A is the only weight hit; B's 110 is not
    const aEdited = { ...a, weightKg: 120 };
    const weightHits2 = collectRecordHits([aEdited, b]).filter((h) => h.kind === 'weight');
    expect(weightHits2.map((h) => ({ workoutId: h.workoutId, value: h.value }))).toEqual([
      { workoutId: 'wA', value: 120 },
    ]);

    // Drop A and recompute: B is the first weight hit
    const weightHits3 = collectRecordHits([b]).filter((h) => h.kind === 'weight');
    expect(weightHits3.map((h) => ({ workoutId: h.workoutId, value: h.value }))).toEqual([
      { workoutId: 'wB', value: 110 },
    ]);
  });

  it('orders same-timestamp sets by position then setId', () => {
    const sPos1 = makeSet({
      setId: 's2',
      at: '2026-01-01T10:00:00.000Z',
      position: 1,
      weightKg: 100,
      reps: 5,
    });
    const sPos0 = makeSet({
      setId: 's9',
      at: '2026-01-01T10:00:00.000Z',
      position: 0,
      weightKg: 100,
      reps: 5,
    });
    const hitsByPos = collectRecordHits([sPos1, sPos0]).filter((h) => h.kind === 'weight');
    expect(hitsByPos).toHaveLength(1);
    expect(hitsByPos[0].setId).toBe('s9');

    const sIdB = makeSet({
      setId: 'set-b',
      at: '2026-01-01T10:00:00.000Z',
      position: 0,
      weightKg: 100,
      reps: 5,
    });
    const sIdA = makeSet({
      setId: 'set-a',
      at: '2026-01-01T10:00:00.000Z',
      position: 0,
      weightKg: 100,
      reps: 5,
    });
    const hitsById = collectRecordHits([sIdB, sIdA]).filter((h) => h.kind === 'weight');
    expect(hitsById).toHaveLength(1);
    expect(hitsById[0].setId).toBe('set-a');
  });

  it('recentRecordHits returns newest hit first and [] for limit <= 0', () => {
    const a = makeSet({
      setId: 'sA',
      workoutId: 'wA',
      at: '2026-01-01T10:00:00.000Z',
      weightKg: 100,
      reps: 5,
    });
    const b = makeSet({
      setId: 'sB',
      workoutId: 'wB',
      at: '2026-01-08T10:00:00.000Z',
      weightKg: 110,
      reps: 6,
    });
    const newest = recentRecordHits([a, b], 1);
    expect(newest).toHaveLength(1);
    expect(newest[0].workoutId).toBe('wB');
    expect(newest[0].kind).toBe('reps');
    expect(recentRecordHits([a, b], 0)).toEqual([]);
    expect(recentRecordHits([a, b], -3)).toEqual([]);
  });
});

function wset(over: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: 's1', workout_id: 'w1', workout_exercise_id: 'we1', position: 0, set_type: 'normal',
    weight_kg: 100, reps: 5, duration_seconds: null, distance_m: null, rpe: null, rir: null,
    completed_at: '2026-01-02T10:05:00.000Z', ...over,
  } as WorkoutSet;
}
function workoutOf(exercises: { id: string; exerciseId: string; logType?: string; perSide?: boolean; sets: WorkoutSet[] }[]): WorkoutWithExercises {
  return {
    id: 'w1', started_at: '2026-01-02T10:00:00.000Z', created_at: '2026-01-02T10:00:00.000Z',
    exercises: exercises.map((e) => ({
      id: e.id, exercise_id: e.exerciseId, exercise_name: e.exerciseId,
      exercise: { log_type: e.logType ?? 'weight_reps', per_side: e.perSide ? 1 : 0 },
      sets: e.sets,
    })),
  } as unknown as WorkoutWithExercises;
}

describe('workoutRecords', () => {
  const prior = new Map([['bench', { weightKg: 90, e1rmKg: 100, volumeKg: 450, reps: 5 }]]);

  it('is empty while priors are loading', () => {
    expect(workoutRecords(workoutOf([{ id: 'we1', exerciseId: 'bench', sets: [wset()] }]), null).size).toBe(0);
  });

  it('flags ticked working sets that beat the prior and ignores warmups and unticked sets', () => {
    const w = workoutOf([
      {
        id: 'we1', exerciseId: 'bench',
        sets: [
          wset({ id: 'a', weight_kg: 100, reps: 5 }),
          wset({ id: 'warm', set_type: 'warmup', weight_kg: 200, reps: 5 }),
          wset({ id: 'open', weight_kg: 200, reps: 5, completed_at: null }),
        ],
      },
    ]);
    const res = workoutRecords(w, prior).get('we1')!;
    expect([...res.setKinds.keys()]).toEqual(['a']);
    expect(res.setKinds.get('a')).toContain('weight');
    expect(res.beaten.weightKg).toBe(100);
  });

  it('uses per-side volume and skips non weight_reps exercises', () => {
    const w = workoutOf([
      { id: 'we1', exerciseId: 'row', perSide: true, sets: [wset({ id: 'r', weight_kg: 20, reps: 10 })] },
      { id: 'we2', exerciseId: 'pull', logType: 'bodyweight_reps', sets: [wset({ id: 'p' })] },
    ]);
    const res = workoutRecords(w, new Map());
    expect(res.has('we2')).toBe(false);
    expect(res.get('we1')!.beaten.volumeKg).toBe(400);
  });

  it('counts exercises, not kinds', () => {
    const w = workoutOf([
      { id: 'we1', exerciseId: 'bench', sets: [wset({ id: 'a', weight_kg: 120, reps: 8 })] },
      { id: 'we2', exerciseId: 'squat', sets: [wset({ id: 'b', weight_kg: 10, reps: 1 })] },
      { id: 'we3', exerciseId: 'ohp', sets: [wset({ id: 'c', weight_kg: 10, reps: 1 })] },
    ]);
    const priors = new Map([
      ['bench', EMPTY_RECORDS],
      ['squat', { weightKg: 500, e1rmKg: 500, volumeKg: 5000, reps: 50 }],
      ['ohp', EMPTY_RECORDS],
    ]);
    expect(countRecordExercises(w, priors)).toBe(2);
    expect(countRecordExercises(w, null)).toBe(0);
    expect(hasBeaten(EMPTY_RECORDS)).toBe(false);
  });
});

describe('formatRecordCount', () => {
  it('is null for none, singular for one, plural otherwise', () => {
    expect(formatRecordCount(0)).toBeNull();
    expect(formatRecordCount(1)).toBe('1 record');
    expect(formatRecordCount(2)).toBe('2 records');
  });
});

describe('formatSetRecordNote', () => {
  const s = { weight_kg: 75, reps: 8 };
  it('names each kind in kg and lb', () => {
    expect(formatSetRecordNote('weight', s, 'kg', false)).toBe('Heaviest 75 kg');
    expect(formatSetRecordNote('weight', { weight_kg: 100, reps: 1 }, 'lb', false)).toBe('Heaviest 220.46 lb');
    expect(formatSetRecordNote('e1rm', s, 'kg', false)).toBe('Est. 1RM 95 kg');
    expect(formatSetRecordNote('volume', { weight_kg: 100, reps: 12 }, 'kg', false)).toBe('Best set 1,200 kg');
    expect(formatSetRecordNote('reps', { weight_kg: 50, reps: 12 }, 'kg', false)).toBe('Most reps 12');
  });
  it('adds /side for per-side exercises', () => {
    expect(formatSetRecordNote('weight', s, 'kg', true)).toBe('Heaviest 75 kg/side');
    expect(formatSetRecordNote('reps', s, 'kg', true)).toBe('Most reps 8/side');
  });
});

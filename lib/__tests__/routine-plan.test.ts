import type { WorkoutSet, WorkoutWithExercises } from '@/lib/types';
import { DEFAULT_SET_COUNT } from '@/lib/workouts/prefill';
import {
  clampSetCount,
  planRoutineStart,
  routineDisplayName,
  routineFromWorkout,
  routineSubtitle,
  setsForRoutineExercise,
} from '@/lib/workouts/routine-plan';

const makeSet = (over: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: 's1',
  workout_id: 'w1',
  workout_exercise_id: 'we1',
  position: 0,
  set_type: 'normal',
  weight_kg: 80,
  reps: 8,
  duration_seconds: null,
  distance_m: null,
  rpe: 9,
  rir: null,
  completed_at: '2026-06-01T10:00:00.000Z',
  created_at: '2026-06-01T10:00:00.000Z',
  updated_at: '2026-06-01T10:00:00.000Z',
  ...over,
});

describe('setsForRoutineExercise', () => {
  it('previous sets win: copies count, type, weight, reps, duration and distance, strips RPE, RIR and completed_at, and ignores planned count', () => {
    const prev: WorkoutSet[] = [
      makeSet({ id: 's1', set_type: 'warmup', weight_kg: 60, reps: 10, rpe: 7 }),
      makeSet({
        id: 's2',
        position: 1,
        set_type: 'failure',
        weight_kg: 100,
        reps: 5,
        duration_seconds: 45,
        distance_m: 200,
        rpe: 10,
      }),
    ];
    const result = setsForRoutineExercise(prev, 5);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      set_type: 'warmup',
      weight_kg: 60,
      reps: 10,
      duration_seconds: null,
      distance_m: null,
      rpe: null,
      rir: null,
      completed_at: null,
    });
    expect(result[1]).toEqual({
      set_type: 'failure',
      weight_kg: 100,
      reps: 5,
      duration_seconds: 45,
      distance_m: 200,
      rpe: null,
      rir: null,
      completed_at: null,
    });
  });

  it('without previous sets, creates empty sets equal to the planned count and falls back on invalid counts', () => {
    expect(setsForRoutineExercise([], 4)).toEqual([{}, {}, {}, {}]);
    expect(setsForRoutineExercise([], 0)).toHaveLength(DEFAULT_SET_COUNT);
    expect(setsForRoutineExercise([], 11)).toHaveLength(DEFAULT_SET_COUNT);
    expect(setsForRoutineExercise([], 2.5)).toHaveLength(DEFAULT_SET_COUNT);
    expect(DEFAULT_SET_COUNT).toBe(2);
  });
});

describe('clampSetCount', () => {
  it('clamps to 1..10 and falls back on non-finite values', () => {
    expect(clampSetCount(0)).toBe(1);
    expect(clampSetCount(-3)).toBe(1);
    expect(clampSetCount(4)).toBe(4);
    expect(clampSetCount(12)).toBe(10);
    expect(clampSetCount(Number.NaN)).toBe(DEFAULT_SET_COUNT);
  });
});

describe('planRoutineStart', () => {
  it('keeps routine order, keeps rest 0, and does not replace stored 120 with 90', () => {
    const routine = {
      id: 'r1',
      name: '  Upper A  ',
      exercises: [
        { exercise_id: 'ex-b', set_count: 3, rest_seconds: 0 },
        { exercise_id: 'ex-a', set_count: 4, rest_seconds: 120 },
      ],
    };
    const prev = new Map<string, WorkoutSet[]>([
      ['ex-b', [makeSet({ weight_kg: 50, reps: 12 })]],
    ]);
    const plan = planRoutineStart(routine, prev);
    expect(plan.routine_id).toBe('r1');
    expect(plan.name).toBe('Upper A');
    expect(plan.exercises.map((e) => e.exercise_id)).toEqual(['ex-b', 'ex-a']);
    expect(plan.exercises[0].rest_seconds).toBe(0);
    expect(plan.exercises[0].sets).toHaveLength(1);
    expect(plan.exercises[1].rest_seconds).toBe(120);
    expect(plan.exercises[1].sets).toHaveLength(4);
  });
});

describe('routineFromWorkout', () => {
  const baseWorkout = (over: Partial<WorkoutWithExercises> = {}): WorkoutWithExercises => ({
    id: 'w1',
    status: 'done',
    source: 'live',
    name: '  Push Day  ',
    date: '2026-10-13',
    started_at: null,
    ended_at: null,
    duration_seconds: 3600,
    notes: null,
    routine_id: null,
    created_at: '2026-10-13T10:00:00.000Z',
    updated_at: '2026-10-13T10:00:00.000Z',
    exercises: [],
    ...over,
  });

  it('uses trimmed workout name, falls back to workoutDisplayName, skips zero-set exercises, clamps 12 sets to 10, and omits weights', () => {
    const twelveSets = Array.from({ length: 12 }, (_, i) =>
      makeSet({ id: `s-${i}`, position: i, weight_kg: 100, reps: 5 })
    );
    const workout = baseWorkout({
      exercises: [
        {
          id: 'we1',
          workout_id: 'w1',
          exercise_id: 'ex-empty',
          position: 0,
          rest_seconds: 90,
          notes: null,
          created_at: '2026-10-13T10:00:00.000Z',
          updated_at: '2026-10-13T10:00:00.000Z',
          exercise_name: 'Empty',
          exercise: null,
          sets: [],
        },
        {
          id: 'we2',
          workout_id: 'w1',
          exercise_id: 'ex-1',
          position: 1,
          rest_seconds: 0,
          notes: null,
          created_at: '2026-10-13T10:00:00.000Z',
          updated_at: '2026-10-13T10:00:00.000Z',
          exercise_name: 'Bench',
          exercise: null,
          sets: twelveSets,
        },
        {
          id: 'we3',
          workout_id: 'w1',
          exercise_id: 'ex-2',
          position: 2,
          rest_seconds: null,
          notes: null,
          created_at: '2026-10-13T10:00:00.000Z',
          updated_at: '2026-10-13T10:00:00.000Z',
          exercise_name: 'Fly',
          exercise: null,
          sets: [makeSet({ id: 's-fly', weight_kg: 20, reps: 15 })],
        },
      ],
    });

    const draft = routineFromWorkout(workout, new Map([['ex-2', 150]]));
    expect(draft.name).toBe('Push Day');
    expect(draft.exercises).toEqual([
      { exercise_id: 'ex-1', set_count: 10, rest_seconds: 0 },
      { exercise_id: 'ex-2', set_count: 1, rest_seconds: 150 },
    ]);
    expect(draft.exercises[0]).not.toHaveProperty('weight_kg');
    expect(draft.exercises[0]).not.toHaveProperty('sets');

    const unnamed = routineFromWorkout(baseWorkout({ name: '   ', date: '2026-10-13' }));
    expect(unnamed.name).toBe('Workout · Tue 13 Oct');
  });
});

describe('routineDisplayName and routineSubtitle', () => {
  it('formats blank routine names as "Routine" and empty exercise lists as "No exercises"', () => {
    expect(routineDisplayName({ name: '   ' })).toBe('Routine');
    expect(routineDisplayName('')).toBe('Routine');
    expect(routineDisplayName({ name: ' Pull ' })).toBe('Pull');

    expect(routineSubtitle([])).toBe('No exercises');
    expect(routineSubtitle({ exercises: [] })).toBe('No exercises');
    expect(routineSubtitle(['Deadlift', 'Pull-up'])).toBe('Deadlift, Pull-up');
    expect(
      routineSubtitle({
        exercises: [
          { exercise_name: 'Squat', exercise: null },
          { exercise_name: 'Leg Press', exercise: { name: 'Leg Press', brand: 'Cybex' } },
        ],
      })
    ).toBe('Squat, Leg Press · Cybex');
  });
});

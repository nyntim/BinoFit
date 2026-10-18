// Pure helpers for routines: clamping set counts, display copy, saving a workout as a routine,
// and planning the exercises and prefilled sets when starting from a routine.
import type {
  Exercise,
  Routine,
  RoutineExercise,
  RoutineExerciseWithExercise,
  WorkoutSet,
  WorkoutWithExercises,
} from '@/lib/types';
import type { SetValues } from '@/lib/workouts/db';
import { exerciseDisplayName } from '@/lib/workouts/exercise-catalog';
import { workoutDisplayName } from '@/lib/workouts/format';
import {
  DEFAULT_SET_COUNT,
  MAX_DEFAULT_SET_COUNT,
  MIN_DEFAULT_SET_COUNT,
  prefillSets,
  resolveRestSeconds,
} from '@/lib/workouts/prefill';

/** Clamps a planned set count to the valid 1..10 range (non-finite values fall back to default). */
export function clampSetCount(count: number): number {
  if (!Number.isFinite(count)) return DEFAULT_SET_COUNT;
  return Math.min(MAX_DEFAULT_SET_COUNT, Math.max(MIN_DEFAULT_SET_COUNT, Math.trunc(count)));
}

/** The routine's trimmed name, or "Routine" when blank. */
export function routineDisplayName(
  routine: Pick<Routine, 'name'> | { name?: string | null } | string | null | undefined
): string {
  const raw = typeof routine === 'string' ? routine : routine?.name;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : 'Routine';
}

type SubtitleItem =
  | string
  | Pick<RoutineExerciseWithExercise, 'exercise_name'> & {
      exercise?: Pick<Exercise, 'name' | 'brand'> | null;
    };

/** Exercise names joined with ", ", or "No exercises" when there are none. */
export function routineSubtitle(
  input: { exercises: readonly SubtitleItem[] } | readonly SubtitleItem[]
): string {
  const list = Array.isArray(input) ? input : (input as { exercises: readonly SubtitleItem[] }).exercises;
  const names = list
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      return item.exercise ? exerciseDisplayName(item.exercise) : item.exercise_name.trim();
    })
    .filter(Boolean);
  return names.length > 0 ? names.join(', ') : 'No exercises';
}

/**
 * Sets for one exercise when starting a routine: previous performance wins (count, type, weight,
 * reps, duration, distance; never RPE or completed_at, and not padded or trimmed to the planned
 * count). Without previous sets, returns `plannedSetCount` empty sets (invalid counts fall back
 * to DEFAULT_SET_COUNT).
 */
export function setsForRoutineExercise(prev: WorkoutSet[], plannedSetCount: number): SetValues[] {
  return prefillSets(prev, plannedSetCount);
}

export type PlannedRoutineExercise = {
  exercise_id: string;
  rest_seconds: number | null;
  sets: SetValues[];
};

export type RoutineStartPlan = {
  routine_id: string;
  name: string;
  exercises: PlannedRoutineExercise[];
};

/**
 * Plans the workout exercises and prefilled sets for starting a routine (live or past workout).
 * Keeps routine order and each exercise's stored rest_seconds (including 0) without re-resolving.
 */
export function planRoutineStart(
  routine: Pick<Routine, 'id' | 'name'> & {
    exercises: readonly Pick<RoutineExercise, 'exercise_id' | 'set_count' | 'rest_seconds'>[];
  },
  previousByExercise: ReadonlyMap<string, WorkoutSet[]> = new Map()
): RoutineStartPlan {
  return {
    routine_id: routine.id,
    name: routineDisplayName(routine),
    exercises: routine.exercises.map((ex) => ({
      exercise_id: ex.exercise_id,
      rest_seconds: ex.rest_seconds,
      sets: setsForRoutineExercise(previousByExercise.get(ex.exercise_id) ?? [], ex.set_count),
    })),
  };
}

export type RoutineDraftFromWorkout = {
  name: string;
  exercises: {
    exercise_id: string;
    set_count: number;
    rest_seconds: number;
  }[];
};

/**
 * Extracts a routine definition from a finished workout: trimmed name (or workoutDisplayName),
 * live exercises in order with non-empty live sets (count clamped to 1..10), and rest_seconds
 * copied when a number (including 0) or resolved when null. Weights and reps are never copied.
 */
export function routineFromWorkout(
  workout: Pick<WorkoutWithExercises, 'name' | 'date' | 'exercises'>,
  lastRestByExercise: ReadonlyMap<string, number | null | undefined> = new Map()
): RoutineDraftFromWorkout {
  const exercises: RoutineDraftFromWorkout['exercises'] = [];
  for (const ex of workout.exercises) {
    if (ex.deleted_at) continue;
    const liveSets = ex.sets.filter((s) => !s.deleted_at);
    if (liveSets.length === 0) continue;
    const rest =
      typeof ex.rest_seconds === 'number'
        ? ex.rest_seconds
        : resolveRestSeconds(lastRestByExercise.get(ex.exercise_id), ex.exercise?.default_rest_seconds);
    exercises.push({
      exercise_id: ex.exercise_id,
      set_count: clampSetCount(liveSets.length),
      rest_seconds: rest,
    });
  }
  return {
    name: workoutDisplayName(workout),
    exercises,
  };
}

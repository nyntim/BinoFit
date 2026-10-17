// Pure training volume rules (kg).
import type { Exercise, SetType, WorkoutSet } from '@/lib/types';

type VolumeSet = Pick<WorkoutSet, 'weight_kg' | 'reps'> & { set_type: SetType };
type VolumeExercise = Pick<Exercise, 'log_type' | 'per_side'>;

/**
 * Volume of one set in kg. Only weight x reps and bodyweight + reps exercises count; warmups,
 * assisted, time and distance sets and unknown exercises count 0. Per-side exercises count both
 * sides. Bodyweight sets count the added load only; plate-loaded machines count the logged plates
 * (the sled weight is never stored in a set).
 */
export function setVolumeKg(set: VolumeSet, exercise: VolumeExercise | null): number {
  if (!exercise || set.set_type === 'warmup') return 0;
  if (exercise.log_type !== 'weight_reps' && exercise.log_type !== 'bodyweight_reps') return 0;
  const reps = set.reps ?? 0;
  const load = set.weight_kg ?? 0;
  if (reps <= 0 || load <= 0) return 0;
  return load * reps * (exercise.per_side ? 2 : 1);
}

type VolumeWorkout = {
  exercises: { exercise: VolumeExercise | null; sets: VolumeSet[] }[];
};

/** Total volume of a workout in kg: every set with data counts, ticked or not. */
export function workoutVolumeKg(workout: VolumeWorkout): number {
  let total = 0;
  for (const ex of workout.exercises) {
    for (const s of ex.sets) total += setVolumeKg(s, ex.exercise);
  }
  return total;
}

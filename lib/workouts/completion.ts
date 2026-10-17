// Pure rules for when a set has data and what saving a logged-afterward workout does.
import type { ExerciseLogType, WorkoutSet, WorkoutWithExercises } from '@/lib/types';
import type { SetValues, WorkoutPatch } from '@/lib/workouts/db';

type FillSet = Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_seconds' | 'distance_m'>;

/**
 * Whether a set holds data for its exercise's log type: weight and reps for weight x reps, reps
 * for bodyweight and assisted (the load is optional), time for time and distance + time (the
 * distance is optional).
 */
export function isSetFilled(set: FillSet, logType: ExerciseLogType): boolean {
  switch (logType) {
    case 'weight_reps':
      return set.weight_kg !== null && set.weight_kg !== undefined && (set.reps ?? 0) > 0;
    case 'bodyweight_reps':
    case 'assisted':
      return (set.reps ?? 0) > 0;
    case 'duration':
    case 'distance_duration':
      return (set.duration_seconds ?? 0) > 0;
  }
}

export type SavePlan = {
  /** Empty sets of exercises that stay. */
  deleteSetIds: string[];
  /** Sets with data that are not ticked yet. */
  tickSetIds: string[];
  /** Exercises left with no set that has data (removed with all their sets). */
  removeExerciseIds: string[];
  /** Workout fields to write: status done and the end time. */
  patch: WorkoutPatch;
  /** False when nothing with data would remain. */
  hasData: boolean;
  /** The timestamp to put on newly ticked sets. */
  tickedAt: string;
};

/** Where `started_at + duration` ends, or null when either is missing. */
export function endFromDuration(startedAt: string | null, durationSeconds: number | null): string | null {
  if (!startedAt || durationSeconds === null || durationSeconds === undefined) return null;
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return null;
  return new Date(start + durationSeconds * 1000).toISOString();
}

/**
 * What Save does to a logged-afterward draft: drop empty sets and exercises left with none, tick
 * the sets with data and mark the workout done (ended at start + duration when both are known).
 */
export function planSave(w: WorkoutWithExercises, now: Date): SavePlan {
  const deleteSetIds: string[] = [];
  const tickSetIds: string[] = [];
  const removeExerciseIds: string[] = [];
  let hasData = false;
  // Nothing may be dated after now: the start is clamped, and so are the end and the ticks.
  const startMs = w.started_at ? new Date(w.started_at).getTime() : NaN;
  const startedAt = !Number.isNaN(startMs) && startMs > now.getTime() ? now.toISOString() : w.started_at;
  let endedAt = endFromDuration(startedAt, w.duration_seconds);
  if (endedAt && endedAt > now.toISOString()) endedAt = now.toISOString();
  const tickedAt = endedAt ?? now.toISOString();

  for (const ex of w.exercises) {
    const logType: ExerciseLogType = ex.exercise?.log_type ?? 'weight_reps';
    const filled = ex.sets.filter((s) => isSetFilled(s, logType));
    if (filled.length === 0) {
      removeExerciseIds.push(ex.id);
      continue;
    }
    hasData = true;
    for (const s of ex.sets) {
      if (!isSetFilled(s, logType)) deleteSetIds.push(s.id);
      else if (!s.completed_at) tickSetIds.push(s.id);
    }
  }

  const patch: WorkoutPatch = { status: 'done' };
  if (endedAt) patch.ended_at = endedAt;
  if (startedAt !== w.started_at && startedAt) patch.started_at = startedAt;
  return { deleteSetIds, tickSetIds, removeExerciseIds, patch, hasData, tickedAt };
}

/**
 * Values to write when a set is ticked. Ticking a set with no data copies the Previous set's
 * values first (the same fields as the prefill); a set that already has data keeps its values.
 */
export function tickPatch(
  set: FillSet,
  logType: ExerciseLogType,
  previous: (FillSet & { set_type?: WorkoutSet['set_type'] }) | null,
  nowIso: string
): SetValues {
  const patch: SetValues = { completed_at: nowIso };
  if (!isSetFilled(set, logType) && previous) {
    // Only fields still empty: typed values are never overwritten.
    if (set.weight_kg == null) patch.weight_kg = previous.weight_kg;
    if (set.reps == null) patch.reps = previous.reps;
    if (set.duration_seconds == null) patch.duration_seconds = previous.duration_seconds;
    if (set.distance_m == null) patch.distance_m = previous.distance_m;
  }
  return patch;
}

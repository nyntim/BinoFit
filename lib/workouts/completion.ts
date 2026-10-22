// Pure rules for when a set has data and what saving a logged-afterward workout does.
import type { EffortMetric, ExerciseLogType, WorkoutSet, WorkoutWithExercises } from '@/lib/types';
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

export type EffortPatch = Partial<Pick<WorkoutSet, 'rpe' | 'rir'>>;

/** Defaults belong only to an explicit completion of a set that supports effort. */
export function completionEffortPatch(set: EffortPatch, logType: ExerciseLogType, metric: EffortMetric | null): EffortPatch {
  if (logType === 'duration' || logType === 'distance_duration') return {};
  if (metric === 'rpe' && set.rpe == null) return { rpe: 10 };
  if (metric === 'rir' && set.rir == null) return { rir: 0 };
  return {};
}

export type SavePlan = {
  effortPatches?: Record<string, EffortPatch>;
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
export function planSave(w: WorkoutWithExercises, now: Date, metric: EffortMetric | null = null): SavePlan {
  const deleteSetIds: string[] = [];
  const tickSetIds: string[] = [];
  const removeExerciseIds: string[] = [];
  const effortPatches: Record<string, EffortPatch> = {};
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
      else if (!s.completed_at) {
        tickSetIds.push(s.id);
        const effort = completionEffortPatch(s, logType, metric);
        if (Object.keys(effort).length) effortPatches[s.id] = effort;
      }
    }
  }

  const patch: WorkoutPatch = { status: 'done' };
  if (endedAt) patch.ended_at = endedAt;
  if (startedAt !== w.started_at && startedAt) patch.started_at = startedAt;
  return { deleteSetIds, tickSetIds, removeExerciseIds, patch, hasData, tickedAt, effortPatches };
}

/**
 * Values to write when a set is ticked. Ticking a set with no data copies the Previous set's
 * values first (the same fields as the prefill); a set that already has data keeps its values.
 */
export function tickPatch(
  set: FillSet & EffortPatch,
  logType: ExerciseLogType,
  previous: (FillSet & { set_type?: WorkoutSet['set_type'] }) | null,
  nowIso: string,
  metric: EffortMetric | null = null
): SetValues {
  const patch: SetValues = { completed_at: nowIso, ...completionEffortPatch(set, logType, metric) };
  if (!isSetFilled(set, logType) && previous) {
    // Only fields still empty: typed values are never overwritten.
    if (set.weight_kg == null) patch.weight_kg = previous.weight_kg;
    if (set.reps == null) patch.reps = previous.reps;
    if (set.duration_seconds == null) patch.duration_seconds = previous.duration_seconds;
    if (set.distance_m == null) patch.distance_m = previous.distance_m;
  }
  return patch;
}

export type FinishPlan = SavePlan & {
  /** Sets that have values but are not ticked (discarded when the user confirms). */
  filledUntickedSetIds: string[];
  /** True when finishing would discard filled unticked sets and the user has not agreed yet. */
  needsConfirm: boolean;
};

export type FinishOptions = {
  /** When the session ended; defaults to `now`. Clamped to the start and to `now`. */
  endAt?: Date;
  /** The user agreed to discard sets that have values but are not ticked. */
  discardUnticked: boolean;
};

/**
 * What Finish does to a live session. Ticked sets stay. Unticked sets without data are dropped;
 * unticked sets with data are dropped only when `discardUnticked` (otherwise `needsConfirm`).
 * Exercises left with no set are removed. The workout becomes done, ends at `endAt` (default
 * `now`), gets its duration from the start, and is dated by its start (local date). `hasData` is
 * false when no set is ticked.
 */
export function planFinish(w: WorkoutWithExercises, now: Date, options: FinishOptions): FinishPlan {
  const deleteSetIds: string[] = [];
  const removeExerciseIds: string[] = [];
  const filledUntickedSetIds: string[] = [];
  let hasData = false;

  for (const ex of w.exercises) {
    const logType: ExerciseLogType = ex.exercise?.log_type ?? 'weight_reps';
    let kept = 0;
    for (const s of ex.sets) {
      if (s.completed_at) {
        kept += 1;
        hasData = true;
      } else if (isSetFilled(s, logType)) {
        filledUntickedSetIds.push(s.id);
        if (options.discardUnticked) deleteSetIds.push(s.id);
        else kept += 1;
      } else {
        deleteSetIds.push(s.id);
      }
    }
    if (kept === 0) removeExerciseIds.push(ex.id);
  }

  const startIso = w.started_at ?? w.created_at;
  const startMs = new Date(startIso).getTime();
  const nowMs = now.getTime();
  const requestedEnd = options.endAt ? options.endAt.getTime() : nowMs;
  const endMs = Math.max(Math.min(requestedEnd, nowMs), Number.isNaN(startMs) ? requestedEnd : startMs);
  const patch: WorkoutPatch = {
    status: 'done',
    ended_at: new Date(endMs).toISOString(),
    duration_seconds: Number.isNaN(startMs) ? null : Math.max(0, Math.floor((endMs - startMs) / 1000)),
  };
  if (!w.started_at) patch.started_at = startIso;
  if (!Number.isNaN(startMs)) patch.date = localDateString(new Date(startMs));

  return {
    deleteSetIds,
    tickSetIds: [],
    removeExerciseIds,
    patch,
    hasData,
    tickedAt: patch.ended_at as string,
    filledUntickedSetIds,
    needsConfirm: hasData && !options.discardUnticked && filledUntickedSetIds.length > 0,
  };
}

function localDateString(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

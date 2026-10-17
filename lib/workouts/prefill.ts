// Pure helpers for prefilling new sets from the previous performance of an exercise.
import { formatDuration, formatWeight, metresToDisplay } from '@/lib/units';
import type { ExerciseLogType, WeightUnit, WorkoutSet } from '@/lib/types';
import type { SetValues } from '@/lib/workouts/db';

export const DEFAULT_REST_SECONDS = 90;

/**
 * Values for the sets of a newly added exercise: a copy of the previous sets in order (set type,
 * weight, reps, time and distance; never RPE or the tick). No previous sets gives one empty set.
 */
export function prefillSets(prev: WorkoutSet[]): SetValues[] {
  if (prev.length === 0) return [{}];
  return prev.map((s) => ({
    set_type: s.set_type,
    weight_kg: s.weight_kg,
    reps: s.reps,
    duration_seconds: s.duration_seconds,
    distance_m: s.distance_m,
    rpe: null,
    completed_at: null,
  }));
}

/** Rest for a newly added exercise: the last rest used, else the exercise default, else 90 s. 0 means off and is kept. */
export function resolveRestSeconds(last: number | null | undefined, exerciseDefault: number | null | undefined): number {
  return last ?? exerciseDefault ?? DEFAULT_REST_SECONDS;
}

/** The previous set at the same index, or null. */
export function previousFor(index: number, prev: WorkoutSet[] | undefined | null): WorkoutSet | null {
  return prev?.[index] ?? null;
}

function trimNumber(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(r);
}

/**
 * The Previous column text: "55 × 10", "30 × 10/side", "+10 × 8" (bodyweight with added load),
 * "BW × 12", "-20 × 8" (assisted), "1:30" (time) or "5 km · 27:30". Null when the set holds nothing
 * to show.
 */
export function formatPreviousSet(
  set: Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_seconds' | 'distance_m'> | null | undefined,
  logType: ExerciseLogType,
  perSide: boolean,
  unit: WeightUnit
): string | null {
  if (!set) return null;
  const reps = set.reps !== null && set.reps !== undefined ? `${set.reps}${perSide ? '/side' : ''}` : null;
  switch (logType) {
    case 'weight_reps':
      if (set.weight_kg === null || reps === null) return null;
      return `${formatWeight(set.weight_kg, unit)} × ${reps}`;
    case 'bodyweight_reps': {
      if (reps === null) return null;
      const load = set.weight_kg && set.weight_kg > 0 ? `+${formatWeight(set.weight_kg, unit)}` : 'BW';
      return `${load} × ${reps}`;
    }
    case 'assisted': {
      if (reps === null) return null;
      const load = set.weight_kg && set.weight_kg > 0 ? `-${formatWeight(set.weight_kg, unit)}` : '0';
      return `${load} × ${reps}`;
    }
    case 'duration':
      return set.duration_seconds ? formatDuration(set.duration_seconds) : null;
    case 'distance_duration': {
      const parts: string[] = [];
      if (set.distance_m) {
        parts.push(`${trimNumber(metresToDisplay(set.distance_m, unit))} ${unit === 'kg' ? 'km' : 'mi'}`);
      }
      if (set.duration_seconds) parts.push(formatDuration(set.duration_seconds));
      return parts.length ? parts.join(' · ') : null;
    }
  }
}

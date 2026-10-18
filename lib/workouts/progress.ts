// Pure training progress helpers: range bucketing, session/duration averages,
// session bar scale, and still-standing recent records derived via lib/workouts/records.ts.
import { bucketSpine, enumerateDates, type BucketUnit } from '@/lib/progress';
import { formatWeightWithUnit } from '@/lib/units';
import { exerciseDisplayName } from '@/lib/workouts/exercise-catalog';
import {
  recentRecordHits,
  recordSetFromWorkoutSet,
  type RecordKind,
  type RecordSet,
} from '@/lib/workouts/records';
import { formatVolume, summarizeWeek } from '@/lib/workouts/summary';
import { workoutVolumeKg } from '@/lib/workouts/volume';
import type { WeightUnit, WorkoutWithExercises } from '@/lib/types';

export type TrainingBucket = {
  /** First date of the full bucket (the Monday, or the first of the month). */
  key: string;
  /** First and last date of the bucket inside the range. */
  start: string;
  end: string;
  unit: BucketUnit;
  sessions: number;
  volumeKg: number;
  hasData: boolean;
  isCurrent: boolean;
};

export type TrainingAverages = {
  sessions: number;
  sessionsPerWeek: number;
  averageDurationSeconds: number;
};

export type RecentRecord = {
  kind: RecordKind;
  exerciseId: string;
  exerciseName: string;
  workoutId: string;
  setId: string;
  date: string;
  value: number;
  valueKg: number | null;
  reps: number | null;
};

const KIND_PRIORITY: Record<RecordKind, number> = {
  weight: 0,
  e1rm: 1,
  volume: 2,
  reps: 3,
};

function isLiveDoneWorkout(w: WorkoutWithExercises): boolean {
  return w.status === 'done' && !w.deleted_at;
}

/**
 * Buckets an inclusive date range (start..end) into day, Monday-week, or month bars,
 * counting done workouts and summing `workoutVolumeKg` per bucket.
 */
export function trainingBuckets(
  start: string,
  end: string,
  unit: BucketUnit,
  workouts: WorkoutWithExercises[],
  weekStartsOn: 0 | 1 = 1
): TrainingBucket[] {
  const sessionsByDate = new Map<string, number>();
  const volumeByDate = new Map<string, number>();

  for (const w of workouts) {
    if (!isLiveDoneWorkout(w)) continue;
    const liveExercises = w.exercises
      .filter((ex) => !ex.deleted_at)
      .map((ex) => ({
        exercise: ex.exercise,
        sets: ex.sets.filter((s) => !s.deleted_at),
      }));
    const vol = workoutVolumeKg({ exercises: liveExercises });
    sessionsByDate.set(w.date, (sessionsByDate.get(w.date) ?? 0) + 1);
    volumeByDate.set(w.date, (volumeByDate.get(w.date) ?? 0) + vol);
  }

  const dates = enumerateDates(start, end);
  return bucketSpine(dates, unit, weekStartsOn).map((b) => {
    let sessions = 0;
    let volumeKg = 0;
    for (const d of b.dates) {
      sessions += sessionsByDate.get(d) ?? 0;
      volumeKg += volumeByDate.get(d) ?? 0;
    }
    return {
      key: b.key,
      start: b.start,
      end: b.end,
      unit: b.unit,
      sessions,
      volumeKg,
      hasData: sessions > 0,
      isCurrent: b.isCurrent,
    };
  });
}

/**
 * Sessions per 7-day window (with a 1-week floor on rangeDays) and mean workout duration in seconds.
 * Includes today. Returns null when there are no done workouts.
 */
export function trainingAverages(
  workouts: WorkoutWithExercises[],
  rangeDays: number
): TrainingAverages | null {
  const done = workouts.filter(isLiveDoneWorkout);
  if (done.length === 0) return null;
  const week = summarizeWeek(done);
  const weeks = Math.max(rangeDays, 7) / 7;
  return {
    sessions: week.sessions,
    sessionsPerWeek: week.sessions / weeks,
    averageDurationSeconds: week.durationSeconds / week.sessions,
  };
}

/** Rounds to 1 decimal place and trims a trailing ".0" (e.g. 3 -> "3", 1.866 -> "1.9"). */
export function formatSessionsPerWeek(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Integer bar scale for session counts, floored at 1 so a single session fills the chart. */
export function sessionBarScale(values: number[]): number {
  const top = Math.max(0, ...values);
  return Math.max(1, Math.ceil(top));
}

function compareWorkoutsChronological(a: WorkoutWithExercises, b: WorkoutWithExercises): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const aStart = a.started_at ?? a.created_at;
  const bStart = b.started_at ?? b.created_at;
  if (aStart !== bStart) return aStart < bStart ? -1 : 1;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/**
 * Up to `limit` still-standing personal records across all done workouts, newest workout first.
 * Delegates PR math and set eligibility to `lib/workouts/records.ts`.
 */
export function recentRecords(workouts: WorkoutWithExercises[], limit = 5): RecentRecord[] {
  if (!(limit > 0)) return [];
  const done = workouts.filter(isLiveDoneWorkout).sort(compareWorkoutsChronological);
  if (done.length === 0) return [];

  const workoutMeta = new Map<string, { date: string; order: number }>();
  const exerciseNames = new Map<string, string>();
  const sets: RecordSet[] = [];

  done.forEach((w, wi) => {
    workoutMeta.set(w.id, { date: w.date, order: wi });
    const links = w.exercises
      .filter((ex) => !ex.deleted_at)
      .slice()
      .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));

    links.forEach((we, ei) => {
      const displayName = we.exercise ? exerciseDisplayName(we.exercise) : we.exercise_name;
      exerciseNames.set(`${w.id}:${we.exercise_id}`, displayName);
      const liveSets = we.sets
        .filter((s) => !s.deleted_at)
        .slice()
        .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));

      liveSets.forEach((s, si) => {
        sets.push(
          recordSetFromWorkoutSet({
            set: s,
            exerciseId: we.exercise_id,
            at: `${String(wi).padStart(8, '0')}:${String(ei).padStart(4, '0')}:${String(si).padStart(4, '0')}`,
            logType: we.exercise?.log_type ?? null,
            perSide: Boolean(we.exercise?.per_side),
          })
        );
      });
    });
  });

  if (sets.length === 0) return [];

  // recentRecordHits returns hits from collectRecordHits in reverse chronological order,
  // so the first occurrence of each (exerciseId, kind) is the still-standing record.
  const allHitsNewestFirst = recentRecordHits(sets, Number.MAX_SAFE_INTEGER);
  const seen = new Set<string>();
  const standing = [];

  for (const hit of allHitsNewestFirst) {
    const key = `${hit.exerciseId}:${hit.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    standing.push(hit);
  }

  standing.sort((a, b) => {
    const orderA = workoutMeta.get(a.workoutId)?.order ?? -1;
    const orderB = workoutMeta.get(b.workoutId)?.order ?? -1;
    if (orderA !== orderB) return orderB - orderA;
    if (a.at !== b.at) return a.at < b.at ? -1 : 1;
    return KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
  });

  return standing.slice(0, Math.floor(limit)).map((hit) => {
    const meta = workoutMeta.get(hit.workoutId);
    const exerciseName =
      exerciseNames.get(`${hit.workoutId}:${hit.exerciseId}`) ?? 'Unknown exercise';
    return {
      kind: hit.kind,
      exerciseId: hit.exerciseId,
      exerciseName,
      workoutId: hit.workoutId,
      setId: hit.setId,
      date: meta?.date ?? '',
      value: hit.value,
      valueKg: hit.kind === 'reps' ? null : hit.value,
      reps: hit.kind === 'reps' ? hit.value : null,
    };
  });
}

export function recordKindLabel(kind: RecordKind): string {
  switch (kind) {
    case 'weight':
      return 'Heaviest';
    case 'e1rm':
      return 'Estimated 1RM';
    case 'volume':
      return 'Set volume';
    case 'reps':
      return 'Most reps';
  }
}

export function formatRecordValue(
  record: Pick<RecentRecord, 'kind' | 'value'>,
  unit: WeightUnit
): string {
  switch (record.kind) {
    case 'weight':
    case 'e1rm':
      return formatWeightWithUnit(record.value, unit);
    case 'volume':
      return `${formatVolume(record.value, unit)} ${unit}`;
    case 'reps':
      return `${record.value} ${record.value === 1 ? 'rep' : 'reps'}`;
  }
}

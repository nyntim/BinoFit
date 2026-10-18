// Pure summaries for the Training tab: week range, per-workout title/subtitle, week totals and
// month grouping. No I/O; callers pass the dates and workouts in.
import { addDays, differenceInSeconds, format, parseISO, startOfWeek } from 'date-fns';
import {
  exerciseDisplayName,
  MUSCLE_REGION,
  REGIONS,
  type Region,
} from '@/lib/workouts/exercise-catalog';
import { formatShortDate, workoutDisplayName } from '@/lib/workouts/format';
import { workoutVolumeKg } from '@/lib/workouts/volume';
import { formatPace, kgToLb, metresToDisplay, pace } from '@/lib/units';
import type {
  MuscleGroup,
  WeekSummary,
  WeightUnit,
  WorkoutSummary,
  WorkoutWithExercises,
} from '@/lib/types';

export type WeekRange = { start: string; end: string };

/** Monday to Sunday (local) containing `today`, as yyyy-MM-dd strings. */
export function weekRange(today: Date): WeekRange {
  const monday = startOfWeek(today, { weekStartsOn: 1 });
  return { start: format(monday, 'yyyy-MM-dd'), end: format(addDays(monday, 6), 'yyyy-MM-dd') };
}

/** "Mon 13 to Sun 19 Oct"; the month (and year, across years) is repeated where it changes. */
export function formatWeekRange(range: WeekRange): string {
  const start = parseISO(range.start);
  const end = parseISO(range.end);
  if (start.getFullYear() !== end.getFullYear()) {
    return `${format(start, 'EEE d MMM yyyy')} to ${format(end, 'EEE d MMM yyyy')}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${format(start, 'EEE d MMM')} to ${format(end, 'EEE d MMM')}`;
  }
  return `${format(start, 'EEE d')} to ${format(end, 'EEE d MMM')}`;
}

/** "58 min", "1h 04m" (rounded to whole minutes); "<1 min" for 1 to 59 seconds. */
export function formatDurationShort(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  if (seconds >= 1 && seconds < 60) return '<1 min';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** Volume in the display unit, rounded, with thousands separators: "12,450". */
export function formatVolume(kg: number, unit: WeightUnit): string {
  const value = Math.round(unit === 'kg' ? kg : kgToLb(kg));
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Stored duration, else started/ended, else 0. */
function workoutSeconds(w: WorkoutWithExercises): number {
  if (w.duration_seconds != null) {
    return Number.isFinite(w.duration_seconds) ? Math.max(0, w.duration_seconds) : 0;
  }
  if (w.started_at && w.ended_at) {
    const diff = differenceInSeconds(parseISO(w.ended_at), parseISO(w.started_at));
    return Number.isFinite(diff) ? Math.max(0, diff) : 0;
  }
  return 0;
}

function isCardio(e: WorkoutWithExercises['exercises'][number]): boolean {
  return e.exercise?.log_type === 'distance_duration';
}

function isCardioOnly(w: WorkoutWithExercises): boolean {
  return w.exercises.length > 0 && w.exercises.every(isCardio);
}

/**
 * The workout's name; blank names show the exercise name for a single cardio exercise,
 * otherwise "Workout · Wed 15 Oct".
 */
export function workoutTitle(w: WorkoutWithExercises): string {
  if (w.name?.trim()) return w.name.trim();
  if (w.exercises.length === 1 && isCardio(w.exercises[0])) return w.exercises[0].exercise_name;
  return workoutDisplayName(w);
}

function cardioDetail(w: WorkoutWithExercises, unit: WeightUnit): string[] {
  let distanceM = 0;
  let seconds = 0;
  for (const e of w.exercises) {
    for (const s of e.sets) {
      distanceM += s.distance_m ?? 0;
      seconds += s.duration_seconds ?? 0;
    }
  }
  const parts: string[] = [];
  if (distanceM > 0) {
    parts.push(`${metresToDisplay(distanceM, unit).toFixed(2)} ${unit === 'kg' ? 'km' : 'mi'}`);
    const p = pace(distanceM, seconds, unit);
    if (p !== null) parts.push(formatPace(p, unit));
  }
  return parts;
}

/** Title, subtitle, duration and volume lines for one finished workout. */
export function summarizeWorkout(w: WorkoutWithExercises, unit: WeightUnit): WorkoutSummary {
  const date = formatShortDate(w.date);
  const cardioOnly = isCardioOnly(w);
  let subtitleParts: string[];
  if (cardioOnly && w.exercises.length === 1) {
    subtitleParts = [date, ...cardioDetail(w, unit)];
  } else {
    const names = w.exercises
      .filter((e) => e.sets.length > 0)
      .map((e) => (e.exercise ? exerciseDisplayName(e.exercise) : e.exercise_name));
    subtitleParts = names.length ? [date, names.join(', ')] : [date];
  }
  const volumeKg = workoutVolumeKg(w);
  let detailLabel: string | null = null;
  if (volumeKg > 0) detailLabel = `${formatVolume(volumeKg, unit)} ${unit}`;
  else if (cardioOnly) detailLabel = 'cardio';
  return {
    id: w.id,
    date: w.date,
    title: workoutTitle(w),
    subtitle: subtitleParts.join(' · '),
    durationLabel: formatDurationShort(workoutSeconds(w)),
    detailLabel,
  };
}

/** Totals of the given done workouts (the caller selects the week by `date`). */
export function summarizeWeek(workouts: WorkoutWithExercises[]): WeekSummary {
  let volumeKg = 0;
  let durationSeconds = 0;
  for (const w of workouts) {
    volumeKg += workoutVolumeKg(w);
    durationSeconds += workoutSeconds(w);
  }
  return { sessions: workouts.length, volumeKg, durationSeconds };
}

export type MonthGroup<T> = { key: string; label: string; items: T[] };

/** Groups items (already newest first) by month of `date`, keeping order. Label "October 2025". */
export function groupByMonth<T extends { date: string }>(items: T[]): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = [];
  for (const item of items) {
    const key = item.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: format(parseISO(item.date), 'MMMM yyyy'), items: [item] });
  }
  return groups;
}

export type MuscleSetTotal = { region: Exclude<Region, 'All'>; sets: number };

const BODY_REGIONS = REGIONS.filter((r): r is Exclude<Region, 'All'> => r !== 'All');

function regionOf(muscle: string): Exclude<Region, 'All'> | null {
  return (MUSCLE_REGION as Record<string, Exclude<Region, 'All'> | null | undefined>)[muscle] ?? null;
}

/**
 * Working sets per body region across the given done workouts. Each ticked non-warmup set credits
 * 1 to any region hit by a primary muscle, else 0.5 to any region hit by a secondary muscle.
 * Regions do not stack within one set. Sorted by sets desc, then `REGIONS` order.
 */
export function setsPerMuscle(workouts: WorkoutWithExercises[]): MuscleSetTotal[] {
  const totals = new Map<Exclude<Region, 'All'>, number>();

  for (const w of workouts) {
    if (w.status !== 'done' || w.deleted_at) continue;
    for (const e of w.exercises) {
      if (!e.exercise || e.deleted_at) continue;
      const primaryRegions = new Set<Exclude<Region, 'All'>>();
      for (const m of e.exercise.primary_muscles ?? ([] as MuscleGroup[])) {
        const region = regionOf(m);
        if (region) primaryRegions.add(region);
      }
      const secondaryRegions = new Set<Exclude<Region, 'All'>>();
      for (const m of e.exercise.secondary_muscles ?? ([] as MuscleGroup[])) {
        const region = regionOf(m);
        if (region && !primaryRegions.has(region)) secondaryRegions.add(region);
      }
      if (primaryRegions.size === 0 && secondaryRegions.size === 0) continue;

      for (const s of e.sets) {
        if (!s.completed_at || s.set_type === 'warmup' || s.deleted_at) continue;
        for (const region of primaryRegions) {
          totals.set(region, (totals.get(region) ?? 0) + 1);
        }
        for (const region of secondaryRegions) {
          totals.set(region, (totals.get(region) ?? 0) + 0.5);
        }
      }
    }
  }

  return BODY_REGIONS.map((region) => ({ region, sets: totals.get(region) ?? 0 }))
    .filter((row) => row.sets > 0)
    .sort((a, b) => b.sets - a.sets);
}

/** Whole numbers without decimals; fractional counts to one decimal place; non-finite/negative -> "0". */
export function formatMuscleSetCount(sets: number): string {
  if (!Number.isFinite(sets) || sets <= 0) return '0';
  return Number.isInteger(sets) ? String(sets) : sets.toFixed(1);
}


// Smoothed trend weight (14-day EWMA decayed by calendar days) and weekly rate.
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { collapseLatestPerDay } from '@/lib/weight';
import { formatWeight } from '@/lib/units';
import type { ProgressRange } from '@/lib/progress';
import type { WeightEntrySource, WeightUnit } from '@/lib/types';

export const TREND_WINDOW_DAYS = 14;
export const MIN_RATE_WEIGH_INS = 4;
export const MIN_RATE_SPAN_DAYS = 10;
export const RATE_LOOKBACK_DAYS = 14;

const DATE_FMT = 'yyyy-MM-dd';

const RANGE_DAYS: Record<Exclude<ProgressRange, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export type TrendInput = {
  id: string;
  date: string;
  weight_kg: number;
  measured_at: string;
  created_at: string;
  source?: WeightEntrySource | null;
  deleted_at?: string | null;
};

export type TrendPoint = {
  date: string; // yyyy-MM-dd, one per day
  weight_kg: number; // collapsed raw weigh-in
  trend_kg: number; // EWMA after this weigh-in
  source: 'manual' | 'healthkit';
};

/**
 * 14-day EWMA decayed by calendar days between collapsed daily weigh-ins.
 * Returns points oldest first, one per day with a weigh-in.
 */
export function trendWeights(entries: TrendInput[]): TrendPoint[] {
  const live = entries.filter(
    (e) =>
      (e.deleted_at === null || e.deleted_at === undefined) &&
      Number.isFinite(e.weight_kg)
  );
  if (live.length === 0) return [];

  // collapseLatestPerDay returns newest day first; reverse to walk oldest first.
  const collapsed = collapseLatestPerDay(live).reverse();
  const points: TrendPoint[] = [];

  for (let i = 0; i < collapsed.length; i++) {
    const entry = collapsed[i];
    const source: 'manual' | 'healthkit' = entry.source === 'healthkit' ? 'healthkit' : 'manual';
    if (i === 0) {
      points.push({
        date: entry.date,
        weight_kg: entry.weight_kg,
        trend_kg: entry.weight_kg,
        source,
      });
    } else {
      const prev = points[i - 1];
      const delta = differenceInCalendarDays(parseISO(entry.date), parseISO(prev.date));
      const alpha = 1 - Math.exp(-delta / TREND_WINDOW_DAYS);
      const trendKg = prev.trend_kg + alpha * (entry.weight_kg - prev.trend_kg);
      points.push({
        date: entry.date,
        weight_kg: entry.weight_kg,
        trend_kg: trendKg,
        source,
      });
    }
  }

  return points;
}

/**
 * Weekly rate in kg/week from the smoothed trend up to `today`.
 * Returns null unless at least 4 weigh-ins on or before today span 10+ calendar days.
 */
export function weeklyRate(trend: TrendPoint[], today: string): number | null {
  const included = trend.filter((p) => p.date <= today);
  if (included.length < MIN_RATE_WEIGH_INS) return null;

  const first = included[0];
  const end = included[included.length - 1];
  const totalSpan = differenceInCalendarDays(parseISO(end.date), parseISO(first.date));
  if (totalSpan < MIN_RATE_SPAN_DAYS) return null;

  const target = format(addDays(parseISO(end.date), -RATE_LOOKBACK_DAYS), DATE_FMT);
  let start = first;
  for (let i = included.length - 1; i >= 0; i--) {
    if (included[i].date <= target) {
      start = included[i];
      break;
    }
  }

  const days = differenceInCalendarDays(parseISO(end.date), parseISO(start.date));
  if (days <= 0) return null;

  return ((end.trend_kg - start.trend_kg) / days) * 7;
}

/**
 * Formatted weekly rate in the display unit, e.g. "−0.3 lb / week" or "+0.2 kg / week".
 * "0 kg / week" when the display rounds to 0.
 */
export function formatWeeklyRate(kgPerWeek: number, unit: WeightUnit): string {
  const magnitude = formatWeight(Math.abs(kgPerWeek), unit);
  if (Number(magnitude) === 0) return `0 ${unit} / week`;
  return `${kgPerWeek < 0 ? '−' : '+'}${magnitude} ${unit} / week`;
}

/**
 * Smoothed change between the first and last trend points dated in [start, end].
 * `days` is the calendar span between those two points. Null under 2 points.
 */
export function trendChange(
  points: TrendPoint[],
  start: string,
  end: string
): { changeKg: number; days: number } | null {
  const inRange = points.filter((p) => p.date >= start && p.date <= end);
  if (inRange.length < 2) return null;
  const first = inRange[0];
  const last = inRange[inRange.length - 1];
  return {
    changeKg: last.trend_kg - first.trend_kg,
    days: differenceInCalendarDays(parseISO(last.date), parseISO(first.date)),
  };
}

/**
 * Vertical domain for display-unit values.
 * Empty -> { min: 0, max: 1 }; otherwise width is at least 0.5 centered on the mid-point.
 */
export function weightChartDomain(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  if (span >= 0.5) return { min: lo, max: hi };
  const mid = (lo + hi) / 2;
  return { min: mid - 0.25, max: mid + 0.25 };
}

/**
 * Rolling window ending today for 7d/30d/90d; for `all`, starts at `earliestWeighIn`
 * when before today, otherwise today.
 */
export function weightRangeBounds(
  range: ProgressRange,
  today: string,
  earliestWeighIn: string | null
): { start: string; end: string } {
  if (range === 'all') {
    const start = earliestWeighIn && earliestWeighIn < today ? earliestWeighIn : today;
    return { start, end: today };
  }
  const start = format(addDays(parseISO(today), -(RANGE_DAYS[range] - 1)), DATE_FMT);
  return { start, end: today };
}

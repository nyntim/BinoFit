// Pure helpers for aligning smoothed trend weight to Progress calorie buckets and scaling the overlay axis.
import { formatWeeklyRate } from '@/lib/weight-trend';

export { formatWeeklyRate };

export type TrendPoint = {
  date: string;
  weight_kg: number;
  trend_kg?: number;
};

const DOMAIN_PAD_RATIO = 0.1;
const FLAT_DOMAIN_PAD_KG = 1;

function pointKg(point: TrendPoint): number {
  return point.trend_kg !== undefined ? point.trend_kg : point.weight_kg;
}

/**
 * Samples the trend at the end of each bucket (`bucket.end`): the last finite point with
 * `date <= bucket.end`, or `null` when no point exists on or before `bucket.end`.
 */
export function alignTrendToBuckets(
  trend: TrendPoint[],
  buckets: { end: string }[]
): (number | null)[] {
  const valid = trend
    .map((p, idx) => ({ date: p.date, kg: pointKg(p), idx }))
    .filter((p) => Boolean(p.date) && Number.isFinite(p.kg));

  if (valid.length === 0) {
    return buckets.map(() => null);
  }

  valid.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.idx - b.idx;
  });

  return buckets.map((b) => {
    let matched: number | null = null;
    for (let i = 0; i < valid.length; i++) {
      if (valid[i].date <= b.end) {
        matched = valid[i].kg;
      } else {
        break;
      }
    }
    return matched;
  });
}

/**
 * Vertical domain in kg for the weight overlay.
 * Returns null when fewer than 2 finite values exist. Never forces 0 into the domain.
 */
export function weightDomain(values: number[]): { min: number; max: number } | null {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return null;

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (min === max) {
    return { min: min - FLAT_DOMAIN_PAD_KG, max: max + FLAT_DOMAIN_PAD_KG };
  }

  const pad = (max - min) * DOMAIN_PAD_RATIO;
  return { min: min - pad, max: max + pad };
}

/**
 * Maps a kg value inside `domain` to a vertical pixel coordinate in `0..height` (top is 0).
 */
export function weightY(
  kg: number,
  domain: { min: number; max: number },
  height: number
): number {
  const span = domain.max - domain.min;
  if (span === 0) return height / 2;
  return height - ((kg - domain.min) / span) * height;
}

/**
 * Splits aligned bucket values on `null` into contiguous runs of `{ index, kg }`.
 * Runs of length 1 are preserved for the caller to skip when drawing polylines.
 */
export function trendSegments(
  values: (number | null)[]
): { index: number; kg: number }[][] {
  const segments: { index: number; kg: number }[][] = [];
  let current: { index: number; kg: number }[] = [];

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
    } else {
      current.push({ index: i, kg: v });
    }
  }

  if (current.length > 0) {
    segments.push(current);
  }

  return segments;
}

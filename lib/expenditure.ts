import { addDays, format, parseISO } from 'date-fns';
import type { DailyTotal } from '@/lib/progress';

export const EXPENDITURE_WINDOW_DAYS = 21;
export const MIN_LOGGED_DAYS = 14;
export const MIN_WEIGH_INS = 4;
export const KCAL_PER_KG = 7700;

const DATE_FMT = 'yyyy-MM-dd';

export type TrendPoint = {
  date: string;
  kg: number;
};

export type ExpenditureEstimate = {
  kcal: number;
  windowDays: number;
  loggedDays: number;
};

/** 21 calendar days ending yesterday (`start = today - 21 days`, `end = yesterday`, `days = 21`). */
export function expenditureWindow(today: string): { start: string; end: string; days: number } {
  const todayDate = parseISO(today);
  const start = format(addDays(todayDate, -EXPENDITURE_WINDOW_DAYS), DATE_FMT);
  const end = format(addDays(todayDate, -1), DATE_FMT);
  return { start, end, days: EXPENDITURE_WINDOW_DAYS };
}

/** Distinct weigh-in dates inside the inclusive `[start, end]` window. */
export function countWeighInsInWindow(
  entries: ReadonlyArray<{ date: string }>,
  start: string,
  end: string
): number {
  const uniqueDates = new Set<string>();
  for (const e of entries) {
    if (e.date >= start && e.date <= end) {
      uniqueDates.add(e.date);
    }
  }
  return uniqueDates.size;
}

/**
 * Estimates daily expenditure from eaten calories and the smoothed weight trend over the
 * 21-day window ending yesterday. Returns null when data is insufficient.
 */
export function estimateExpenditure(
  daily: ReadonlyArray<DailyTotal>,
  trend: ReadonlyArray<TrendPoint>,
  weighIns: number,
  today: string
): ExpenditureEstimate | null {
  if (!Number.isFinite(weighIns) || weighIns < MIN_WEIGH_INS) return null;

  const { start, end, days } = expenditureWindow(today);

  const logged = daily.filter((d) => d.date >= start && d.date <= end && d.eatenLogs > 0);
  if (logged.length < MIN_LOGGED_DAYS) return null;

  let calorieSum = 0;
  for (const d of logged) {
    if (!Number.isFinite(d.calories)) return null;
    calorieSum += d.calories;
  }
  const averageEaten = calorieSum / logged.length;

  // Deduplicate same-day points (later input wins), drop today/future, and sort chronologically.
  const byDate = new Map<string, TrendPoint>();
  for (const p of trend) {
    if (p.date < today) {
      if (!Number.isFinite(p.kg)) return null;
      byDate.set(p.date, p);
    }
  }
  const sorted = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  function trendKg(targetDate: string): number | null {
    let latest: number | null = null;
    for (const p of sorted) {
      if (p.date <= targetDate) {
        latest = p.kg;
      } else {
        break;
      }
    }
    return latest;
  }

  const startKg = trendKg(start);
  const endKg = trendKg(end);
  if (startKg === null || endKg === null || !Number.isFinite(startKg) || !Number.isFinite(endKg)) {
    return null;
  }

  const changeKg = endKg - startKg;
  const kcal = Math.round(averageEaten - (changeKg * KCAL_PER_KG) / days);

  return {
    kcal,
    windowDays: days,
    loggedDays: logged.length,
  };
}

/** Formats daily expenditure as e.g. `2,450 kcal/day`, `0 kcal/day`, or `−1,200 kcal/day`. */
export function formatExpenditure(kcal: number): string {
  const rounded = Math.round(kcal);
  if (rounded === 0) return '0 kcal/day';
  const abs = Math.abs(rounded).toLocaleString('en-US');
  return `${rounded < 0 ? '−' : ''}${abs} kcal/day`;
}

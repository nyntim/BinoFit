import { addDays, differenceInCalendarDays, format, parseISO, startOfMonth } from 'date-fns';
import { isSlotEaten, logTotals, type NutritionTotals } from '@/lib/nutrition-totals';
import type { FoodLogWithFood, MealSlotConfirmation } from '@/lib/types';

export type ProgressRange = '7d' | '30d' | '90d' | 'all';
export type BucketUnit = 'day' | 'week' | 'month';

export type DailyTotal = {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Logs in eaten slots. */
  eatenLogs: number;
  /** Any live log that day, planned or eaten. */
  anyLogs: boolean;
};

export type ProgressSummary = {
  /** Days that feed the averages: before today, with at least one eaten log. */
  averagedDays: number;
  avg: NutritionTotals | null;
  /** Days up to today with any log (planned or eaten). */
  loggedDays: number;
  totalDays: number;
};

export type Bucket = {
  /** First date of the full bucket (the Monday, or the first of the month). */
  key: string;
  /** First and last date of the bucket inside the range. */
  start: string;
  end: string;
  unit: BucketUnit;
  calories: number;
  hasData: boolean;
  isCurrent: boolean;
};

export type DateBucket = {
  /** First date of the full bucket (the Monday, or the first of the month). */
  key: string;
  /** First and last date of the bucket inside the range. */
  start: string;
  end: string;
  unit: BucketUnit;
  dates: string[];
  isCurrent: boolean;
};

const DATE_FMT = 'yyyy-MM-dd';
const MAX_WEEKLY_HISTORY_DAYS = 182;

const RANGE_DAYS: Record<Exclude<ProgressRange, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

/** Inclusive yyyy-MM-dd list from start to end, by local calendar day. */
export function enumerateDates(start: string, end: string): string[] {
  const out: string[] = [];
  const last = parseISO(end);
  for (let d = parseISO(start); d <= last; d = addDays(d, 1)) {
    out.push(format(d, DATE_FMT));
  }
  return out;
}

/** Rolling window ending today. `all` starts at the first logged date. */
export function rangeBounds(
  range: ProgressRange,
  today: string,
  firstLoggedDate: string | null
): { start: string; end: string; days: number } {
  let start: string;
  if (range === 'all') {
    start = firstLoggedDate && firstLoggedDate < today ? firstLoggedDate : today;
  } else {
    start = format(addDays(parseISO(today), -(RANGE_DAYS[range] - 1)), DATE_FMT);
  }
  return { start, end: today, days: differenceInCalendarDays(parseISO(today), parseISO(start)) + 1 };
}

/** One entry per date from start to end, empty days included. Only eaten slots add to the totals. */
export function buildDailyTotals(
  logs: FoodLogWithFood[],
  confirmations: MealSlotConfirmation[],
  start: string,
  end: string
): DailyTotal[] {
  const days = new Map<string, DailyTotal>();
  for (const date of enumerateDates(start, end)) {
    days.set(date, { date, calories: 0, protein: 0, carbs: 0, fat: 0, eatenLogs: 0, anyLogs: false });
  }
  const confsByDate = new Map<string, MealSlotConfirmation[]>();
  for (const c of confirmations) {
    const list = confsByDate.get(c.date);
    if (list) list.push(c);
    else confsByDate.set(c.date, [c]);
  }
  for (const log of logs) {
    const day = days.get(log.date);
    if (!day) continue;
    day.anyLogs = true;
    if (!isSlotEaten(confsByDate.get(log.date) ?? [], log.meal_slot)) continue;
    const t = logTotals(log);
    day.calories += t.calories;
    day.protein += t.protein;
    day.carbs += t.carbs;
    day.fat += t.fat;
    day.eatenLogs += 1;
  }
  return [...days.values()];
}

/** Averages cover past days with eaten logs; today is shown but never averaged. */
export function summarize(daily: DailyTotal[], today: string): ProgressSummary {
  const averaged = daily.filter((d) => d.date < today && d.eatenLogs > 0);
  const loggedDays = daily.filter((d) => d.anyLogs && d.date <= today).length;
  if (averaged.length === 0) {
    return { averagedDays: 0, avg: null, loggedDays, totalDays: daily.length };
  }
  const sum = averaged.reduce(
    (acc, d) => ({
      calories: acc.calories + d.calories,
      protein: acc.protein + d.protein,
      carbs: acc.carbs + d.carbs,
      fat: acc.fat + d.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const n = averaged.length;
  return {
    averagedDays: n,
    avg: { calories: sum.calories / n, protein: sum.protein / n, carbs: sum.carbs / n, fat: sum.fat / n },
    loggedDays,
    totalDays: daily.length,
  };
}

function bucketKey(date: string, unit: BucketUnit, weekStartsOn: 0 | 1): string {
  if (unit === 'day') return date;
  const d = parseISO(date);
  if (unit === 'month') return format(startOfMonth(d), DATE_FMT);
  const back = (d.getDay() - weekStartsOn + 7) % 7;
  return format(addDays(d, -back), DATE_FMT);
}

/** Groups an inclusive date list into day, week or month buckets without nutrition math. */
export function bucketSpine(
  dates: string[],
  unit: BucketUnit,
  weekStartsOn: 0 | 1 = 1
): DateBucket[] {
  const groups: { key: string; dates: string[] }[] = [];
  for (const date of dates) {
    const key = bucketKey(date, unit, weekStartsOn);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.dates.push(date);
    else groups.push({ key, dates: [date] });
  }
  return groups.map((g, i) => ({
    key: g.key,
    start: g.dates[0],
    end: g.dates[g.dates.length - 1],
    unit,
    dates: g.dates,
    isCurrent: i === groups.length - 1,
  }));
}

/** Groups days into bars. Week and month bars average the days that have eaten logs. */
export function bucket(daily: DailyTotal[], unit: BucketUnit, weekStartsOn: 0 | 1 = 1): Bucket[] {
  const groups: { key: string; days: DailyTotal[] }[] = [];
  for (const d of daily) {
    const key = bucketKey(d.date, unit, weekStartsOn);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.days.push(d);
    else groups.push({ key, days: [d] });
  }
  return groups.map((g, i) => {
    const eaten = g.days.filter((d) => d.eatenLogs > 0);
    const total = eaten.reduce((s, d) => s + d.calories, 0);
    return {
      key: g.key,
      start: g.days[0].date,
      end: g.days[g.days.length - 1].date,
      unit,
      calories: eaten.length === 0 ? 0 : unit === 'day' ? total : total / eaten.length,
      hasData: eaten.length > 0,
      isCurrent: i === groups.length - 1,
    };
  });
}

export function bucketFor(range: ProgressRange, historyDays: number): BucketUnit {
  if (range === '7d' || range === '30d') return 'day';
  if (range === '90d') return 'week';
  return historyDays <= MAX_WEEKLY_HISTORY_DAYS ? 'week' : 'month';
}

/** Chart maximum: the tallest bar or goal with headroom, rounded up to 100. */
export function chartScale(values: number[], goal: number | null): number {
  const top = Math.max(0, ...values, goal ?? 0);
  return Math.max(100, Math.ceil((top * 8) / 7 / 100 - 1e-9) * 100);
}

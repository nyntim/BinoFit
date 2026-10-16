import { addDays, format, parseISO } from 'date-fns';
import { mealsForDay } from '@/lib/meals';
import { isSlotEaten, logTotals } from '@/lib/nutrition-totals';
import type {
  FoodLogWithFood,
  MealDefinition,
  MealNameEntry,
  MealSlotConfirmation,
} from '@/lib/types';

export type ExportRange = '7d' | '30d' | 'all';

export type ExportRow = {
  date: string;
  meal: string;
  status: 'Eaten' | 'Planned';
  food: string;
  brand: string;
  servings: number;
  servingUnit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

const DATE_FORMAT = 'yyyy-MM-dd';

export const EXPORT_HEADERS = [
  'Date',
  'Meal',
  'Status',
  'Food',
  'Brand',
  'Servings',
  'Serving unit',
  'Calories',
  'Protein (g)',
  'Carbs (g)',
  'Fat (g)',
] as const;

/** Inclusive yyyy-MM-dd bounds for a range ending `today`. "All time" has no bounds. */
export function rangeDates(
  range: ExportRange,
  today: string
): { start: string | null; end: string | null } {
  if (range === 'all') return { start: null, end: null };
  const days = range === '7d' ? 6 : 29;
  return { start: format(addDays(parseISO(today), -days), DATE_FORMAT), end: today };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** One row per log, sorted by date, meal position, then created_at. */
export function buildExportRows(
  logs: FoodLogWithFood[],
  defs: MealDefinition[],
  names: MealNameEntry[],
  confirmations: Pick<MealSlotConfirmation, 'date' | 'meal_slot' | 'confirmed'>[]
): ExportRow[] {
  const byDate = new Map<string, FoodLogWithFood[]>();
  for (const log of logs) {
    const list = byDate.get(log.date);
    if (list) list.push(log);
    else byDate.set(log.date, [log]);
  }
  const rows: ExportRow[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const dayLogs = [...byDate.get(date)!].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const dayConfirmations = confirmations.filter((c) => c.date === date);
    for (const meal of mealsForDay(defs, names, dayLogs, date)) {
      const status = isSlotEaten(dayConfirmations, meal.id) ? 'Eaten' : 'Planned';
      for (const log of dayLogs) {
        if (log.meal_slot !== meal.id) continue;
        const t = logTotals(log);
        rows.push({
          date,
          meal: meal.name,
          status,
          food: log.food_name,
          brand: log.food_brand ?? '',
          servings: round2(log.serving_amount),
          servingUnit: log.serving_unit ?? '',
          calories: Math.round(t.calories),
          protein: round1(t.protein),
          carbs: round1(t.carbs),
          fat: round1(t.fat),
        });
      }
    }
  }
  return rows;
}

/** Quotes only when needed. Text starting with = + - @ or tab gets a leading ' (formula injection). */
export function csvField(value: string | number, isText = false): string {
  let s = String(value);
  if (isText && /^[=+\-@\t]/.test(s)) s = `'${s}`;
  return /["\r\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8 BOM, CRLF after every line including the last. */
export function toCsv(rows: ExportRow[]): string {
  const lines = [EXPORT_HEADERS.map((h) => csvField(h)).join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvField(r.date),
        csvField(r.meal, true),
        csvField(r.status),
        csvField(r.food, true),
        csvField(r.brand, true),
        csvField(r.servings),
        csvField(r.servingUnit, true),
        csvField(r.calories),
        csvField(r.protein),
        csvField(r.carbs),
        csvField(r.fat),
      ].join(',')
    );
  }
  return '﻿' + lines.map((l) => l + '\r\n').join('');
}

export function exportFileName(
  start: string | null,
  end: string | null,
  today: string
): string {
  return start && end
    ? `binofit-food-log-${start}-to-${end}.csv`
    : `binofit-food-log-all-${today}.csv`;
}

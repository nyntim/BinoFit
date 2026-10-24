import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';

export type Streaks = { currentStreak: number; longestStreak: number };

/**
 * Streaks from logged yyyy-MM-dd dates. `today` is the local date, passed in.
 * The current streak counts back from today, or from yesterday while today is unlogged.
 */
export function computeStreaks(dates: string[], today: string): Streaks {
  const sorted = [...new Set(dates)].filter((d) => d <= today).sort();
  if (sorted.length === 0) return { currentStreak: 0, longestStreak: 0 };

  let longestStreak = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const gap = differenceInCalendarDays(parseISO(sorted[i]), parseISO(sorted[i - 1]));
    run = gap === 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
  }

  return { currentStreak: currentRun(sorted, today).length, longestStreak };
}

/** The run behind the current streak, oldest first. Shared so the count and the dates cannot drift. */
function currentRun(sortedUnique: string[], today: string): string[] {
  const logged = new Set(sortedUnique);
  const yesterday = format(addDays(parseISO(today), -1), 'yyyy-MM-dd');
  let cursor = logged.has(today) ? parseISO(today) : logged.has(yesterday) ? parseISO(yesterday) : null;
  const run: string[] = [];
  while (cursor && logged.has(format(cursor, 'yyyy-MM-dd'))) {
    run.push(format(cursor, 'yyyy-MM-dd'));
    cursor = addDays(cursor, -1);
  }
  return run.reverse();
}

/** The dates of the current streak (same run `computeStreaks` counts), oldest first. */
export function currentStreakDates(dates: string[], today: string): string[] {
  const sorted = [...new Set(dates)].filter((d) => d <= today).sort();
  return currentRun(sorted, today);
}

import type { WorkoutSummary } from '@/lib/types';

/**
 * One line for the calendar day summary: "1,100 cal eaten · Push day, 58 min".
 * `eatenCalories` is null when the food read failed; the workout part then stands alone.
 */
export function daySummaryLine(eatenCalories: number | null, workouts: readonly WorkoutSummary[]): string {
  const [first] = workouts;
  const training = first
    ? `${first.title}, ${first.durationLabel}${workouts.length > 1 ? ` +${workouts.length - 1} more` : ''}`
    : null;
  if (eatenCalories === null) return training ?? "Couldn't load this day";
  const food = eatenCalories > 0 ? `${eatenCalories.toLocaleString('en-US')} cal eaten` : 'No food logged';
  return training ? `${food} · ${training}` : food;
}

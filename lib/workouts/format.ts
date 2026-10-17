import { format, parseISO } from 'date-fns';
import type { Workout } from '@/lib/types';

/** The workout's name, or "Workout · Tue 14 Oct" (from its date) when the name is blank. */
export function workoutDisplayName(workout: Pick<Workout, 'name' | 'date'>): string {
  const name = workout.name?.trim();
  if (name) return name;
  return `Workout · ${format(parseISO(workout.date), 'EEE d MMM')}`;
}

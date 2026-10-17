import { format, parseISO } from 'date-fns';
import { formatWeight } from '@/lib/units';
import type { Exercise, Workout, WeightUnit } from '@/lib/types';

/** The workout's name, or "Workout · Tue 14 Oct" (from its date) when the name is blank. */
export function workoutDisplayName(workout: Pick<Workout, 'name' | 'date'>): string {
  const name = workout.name?.trim();
  if (name) return name;
  return `Workout · ${format(parseISO(workout.date), 'EEE d MMM')}`;
}

/** "Wed 15 Oct" from a yyyy-MM-dd date string or a Date. */
export function formatShortDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'EEE d MMM');
}

/**
 * Parses a clock typed as digits that fill from the right: "2730" is 27:30 in 'ms' (minutes and
 * seconds) and "150" is 1:50 in 'hm' (hours and minutes). Colons are ignored, except that a full
 * h:m:s text ("1:40:00") is read as hours, minutes and seconds in 'ms' mode. Returns seconds, or
 * null for empty or invalid input (the low part must be below 60).
 */
export function parseClockDigits(text: string, mode: 'ms' | 'hm'): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (mode === 'ms') {
    const hms = /^(\d+):(\d{1,2}):(\d{1,2})$/.exec(trimmed);
    if (hms) {
      const [h, m, s] = [Number(hms[1]), Number(hms[2]), Number(hms[3])];
      return m < 60 && s < 60 ? h * 3600 + m * 60 + s : null;
    }
  }
  if (!/^[\d:]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/:/g, '');
  if (!digits || digits.length > 6) return null;
  const low = Number(digits.slice(-2));
  const high = digits.length > 2 ? Number(digits.slice(0, -2)) : 0;
  // In 'hm' mode one or two digits are minutes ("90" is 1:30).
  if (mode === 'hm' && digits.length <= 2) return Number(digits) * 60;
  if (low >= 60) return null;
  return mode === 'ms' ? high * 60 + low : high * 3600 + low * 60;
}

/** h:mm for a duration in seconds (e.g. 3000 -> "0:50"), the display form for 'hm' fields. */
export function formatHoursMinutes(totalSeconds: number): string {
  const minutes = Math.round(Math.max(0, totalSeconds) / 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * The line under an exercise name in the editor: setup notes plus the loading detail, e.g.
 * "Seat 4, back pad 2 · Plate-loaded, 20 kg sled". Null when there is nothing to show.
 */
export function setupDetailLine(
  e: Pick<Exercise, 'setup_notes' | 'load_type' | 'base_weight_kg'>,
  unit: WeightUnit
): string | null {
  const parts: string[] = [];
  const notes = e.setup_notes?.trim();
  if (notes) parts.push(notes);
  if (e.load_type === 'plate') {
    const sled = e.base_weight_kg && e.base_weight_kg > 0 ? `, ${formatWeight(e.base_weight_kg, unit)} ${unit} sled` : '';
    parts.push(`Plate-loaded${sled}`);
  } else if (e.load_type === 'stack') {
    parts.push('Weight stack');
  }
  return parts.length ? parts.join(' · ') : null;
}

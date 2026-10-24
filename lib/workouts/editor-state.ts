// Pure state for the workout editor: the reducer over a loaded workout, set badges, table columns
// and the text <-> value conversion of the numeric cells.
import {
  displayToMetres,
  distanceUnitFor,
  formatDuration,
  formatPace,
  formatWeight,
  lbToKg,
  metresToDisplay,
  pace,
  parseDecimal,
} from '@/lib/units';
import { parseClockDigits } from '@/lib/workouts/format';
import type { EffortMetric, ExerciseLogType, SetType, WeightUnit, WorkoutSet, WorkoutWithExercises } from '@/lib/types';
import type { SetValues, WorkoutExercisePatch, WorkoutPatch } from '@/lib/workouts/db';

// ── Reducer ────────────────────────────────────────────────────

export type EditorState = WorkoutWithExercises | null;

export type EditorAction =
  | { type: 'load'; workout: WorkoutWithExercises | null }
  | { type: 'meta'; patch: WorkoutPatch }
  | { type: 'addSet'; set: WorkoutSet }
  | { type: 'updateSet'; id: string; patch: SetValues }
  | { type: 'deleteSet'; id: string }
  | { type: 'removeExercise'; id: string }
  | { type: 'updateExercise'; id: string; patch: WorkoutExercisePatch };

/** Applies an action to the loaded workout. Unknown ids are ignored; the input is never mutated. */
export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  if (action.type === 'load') return action.workout;
  if (!state) return state;
  switch (action.type) {
    case 'meta':
      return { ...state, ...action.patch };
    case 'addSet':
      return {
        ...state,
        exercises: state.exercises.map((e) =>
          e.id === action.set.workout_exercise_id && !e.sets.some((s) => s.id === action.set.id)
            ? { ...e, sets: [...e.sets, action.set] }
            : e
        ),
      };
    case 'updateSet':
      return {
        ...state,
        exercises: state.exercises.map((e) =>
          e.sets.some((s) => s.id === action.id)
            ? { ...e, sets: e.sets.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)) }
            : e
        ),
      };
    case 'deleteSet':
      return {
        ...state,
        exercises: state.exercises.map((e) =>
          e.sets.some((s) => s.id === action.id) ? { ...e, sets: e.sets.filter((s) => s.id !== action.id) } : e
        ),
      };
    case 'removeExercise':
      return { ...state, exercises: state.exercises.filter((e) => e.id !== action.id) };
    case 'updateExercise':
      return {
        ...state,
        exercises: state.exercises.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e)),
      };
  }
}

// ── Set badges ─────────────────────────────────────────────────

export type SetBadge = {
  /** "W", "D", "F" or the working-set number. */
  label: string;
  /** True for W, D and F (shown in the secondary colour). */
  special: boolean;
  /** For screen readers, e.g. "Warm-up set" or "Set 2". */
  accessibilityLabel: string;
};

export const SET_TYPE_LABELS: Record<SetType, string> = {
  normal: 'Normal',
  warmup: 'Warm-up',
  drop: 'Drop set',
  failure: 'Failure',
};

/** One line under each set type in the set type sheet. */
export const SET_TYPE_DESCRIPTIONS: Record<SetType, string> = {
  normal: 'A working set, counted in volume',
  warmup: 'Not counted in volume or records',
  drop: 'Lighter weight straight after',
  failure: 'Taken to failure',
};

/** The label the set at `index` would show if it were a normal set (the Normal row's number). */
export function badgeIfNormal(sets: Pick<WorkoutSet, 'set_type'>[], index: number): string {
  let n = 0;
  sets.forEach((s, i) => {
    if (i < index && s.set_type !== 'warmup' && s.set_type !== 'drop' && s.set_type !== 'failure') n += 1;
  });
  return String(n + 1);
}

/** Badges for a list of sets: W warm-up, D drop, F failure; normal sets are numbered 1, 2, 3 skipping the others. */
export function setBadges(sets: Pick<WorkoutSet, 'set_type'>[]): SetBadge[] {
  let n = 0;
  return sets.map((s) => {
    switch (s.set_type) {
      case 'warmup':
        return { label: 'W', special: true, accessibilityLabel: 'Warm-up set' };
      case 'drop':
        return { label: 'D', special: true, accessibilityLabel: 'Drop set' };
      case 'failure':
        return { label: 'F', special: true, accessibilityLabel: 'Failure set' };
      default:
        n += 1;
        return { label: String(n), special: false, accessibilityLabel: `Set ${n}` };
    }
  });
}

// ── Columns ────────────────────────────────────────────────────

export type CellKey = 'weight' | 'reps' | 'duration' | 'distance' | 'rpe' | 'rir';
export type ColumnKey = 'badge' | 'previous' | CellKey | 'pace' | 'done';

export type SetColumn = {
  key: ColumnKey;
  label: string;
  /** Spoken label when the visible one is terse (e.g. "-kg"). */
  accessibilityLabel?: string;
  /** Fixed width in px, or 'flex' to take the rest. */
  width: number | 'flex';
  align: 'left' | 'center' | 'right';
};

const col = (c: SetColumn): SetColumn => c;

/**
 * The table columns for an exercise: Set, Previous (not for distance + time), the inputs for its log
 * type, Pace for distance + time, optional RPE or RIR and the Done column. Widths follow the mockups
 * (36 / flex / 64 / 56 / 44 for strength, 36 / 80 / 80 / flex for cardio).
 */
export function setColumns(
  logType: ExerciseLogType,
  perSide: boolean,
  unit: WeightUnit,
  opts: { effort: EffortMetric | null; showDone: boolean }
): SetColumn[] {
  const cols: SetColumn[] = [col({ key: 'badge', label: 'Set', width: 36, align: 'center' })];
  const reps = col({ key: 'reps', label: perSide ? 'Reps/side' : 'Reps', width: perSide ? 72 : 56, align: 'center' });
  switch (logType) {
    case 'weight_reps':
      cols.push(
        col({ key: 'previous', label: 'Previous', width: 'flex', align: 'left' }),
        col({ key: 'weight', label: unit, width: 64, align: 'center' }),
        reps
      );
      break;
    case 'bodyweight_reps':
      cols.push(
        col({ key: 'previous', label: 'Previous', width: 'flex', align: 'left' }),
        col({ key: 'weight', label: `+${unit}`, accessibilityLabel: `Added weight in ${unit}`, width: 64, align: 'center' }),
        reps
      );
      break;
    case 'assisted':
      cols.push(
        col({ key: 'previous', label: 'Previous', width: 'flex', align: 'left' }),
        col({ key: 'weight', label: `-${unit}`, accessibilityLabel: `Assistance in ${unit}`, width: 64, align: 'center' }),
        reps
      );
      break;
    case 'duration':
      cols.push(
        col({ key: 'previous', label: 'Previous', width: 'flex', align: 'left' }),
        col({ key: 'duration', label: 'Time', width: 80, align: 'center' })
      );
      break;
    case 'distance_duration':
      cols.push(
        col({ key: 'distance', label: distanceUnitFor(unit), width: 80, align: 'center' }),
        col({ key: 'duration', label: 'Time', width: 80, align: 'center' }),
        col({ key: 'pace', label: 'Pace', width: 'flex', align: 'right' })
      );
      break;
  }
  if (opts.effort && logType !== 'duration' && logType !== 'distance_duration') {
    cols.push(
      opts.effort === 'rir'
        ? col({ key: 'rir', label: 'RIR', accessibilityLabel: 'Reps in reserve', width: 48, align: 'center' })
        : col({ key: 'rpe', label: 'RPE', width: 48, align: 'center' })
    );
  }
  if (opts.showDone) cols.push(col({ key: 'done', label: 'Done', width: 44, align: 'center' }));
  return cols;
}

// ── Cells ──────────────────────────────────────────────────────

type CellSet = Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_seconds' | 'distance_m' | 'rpe' | 'rir'>;

/** The text shown in a numeric cell ("" when empty): weights in the display unit, time as m:ss, distance with 2 decimals. */
export function cellText(set: Partial<CellSet>, key: CellKey, unit: WeightUnit): string {
  switch (key) {
    case 'weight':
      return set.weight_kg === null || set.weight_kg === undefined ? '' : formatWeight(set.weight_kg, unit);
    case 'reps':
      return set.reps === null || set.reps === undefined ? '' : String(set.reps);
    case 'duration':
      return set.duration_seconds ? formatDuration(set.duration_seconds) : '';
    case 'distance':
      return set.distance_m ? metresToDisplay(set.distance_m, unit).toFixed(2) : '';
    case 'rpe':
      return set.rpe === null || set.rpe === undefined ? '' : String(set.rpe);
    case 'rir':
      return set.rir === null || set.rir === undefined ? '' : String(set.rir);
  }
}

/**
 * Converts typed cell text to the values to store (kg and metres). Empty text clears the field.
 * Returns null for invalid input (the cell reverts).
 */
export function cellPatch(key: CellKey, text: string, unit: WeightUnit): SetValues | null {
  const t = text.trim();
  switch (key) {
    case 'weight': {
      if (!t) return { weight_kg: null };
      const n = parseDecimal(t);
      if (n === null || n > 5000) return null;
      return { weight_kg: unit === 'kg' ? n : lbToKg(n) };
    }
    case 'reps': {
      if (!t) return { reps: null };
      if (!/^\d{1,3}$/.test(t)) return null;
      return { reps: Number(t) };
    }
    case 'duration': {
      if (!t) return { duration_seconds: null };
      const s = parseClockDigits(t, 'ms');
      return s === null ? null : { duration_seconds: s };
    }
    case 'distance': {
      if (!t) return { distance_m: null };
      const n = parseDecimal(t);
      if (n === null || n > 10000) return null;
      return { distance_m: displayToMetres(n, unit) };
    }
    case 'rpe': {
      if (!t) return { rpe: null };
      const n = parseDecimal(t);
      if (n === null || n < 1 || n > 10) return null;
      return { rpe: n };
    }
    case 'rir': {
      if (!t) return { rir: null };
      if (!/^\d{1,2}$/.test(t)) return null;
      const n = Number(t);
      return n > 10 ? null : { rir: n };
    }
  }
}

/** Pace text for the Pace column ("5:30 /km", "--" without distance and time). */
export function paceText(set: Pick<WorkoutSet, 'distance_m' | 'duration_seconds'>, unit: WeightUnit): string {
  return formatPace(pace(set.distance_m ?? 0, set.duration_seconds ?? 0, unit), unit);
}

// ── Schedule (date, start, duration) ───────────────────────────

export type ScheduleFields = Pick<WorkoutWithExercises, 'date' | 'started_at' | 'duration_seconds'>;

export type ScheduleChange = {
  /** A new calendar date; the start keeps its time of day. */
  date?: Date;
  /** A new time of day; the start keeps its date. */
  time?: Date;
  duration_seconds?: number | null;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function localDateString(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * The workout fields to write when the date, start time or duration changes. `started_at` always
 * stays on `date`, is never later than `now`, and `ended_at` follows start + duration when both are known.
 */
export function applySchedule(current: ScheduleFields, change: ScheduleChange, now: Date = new Date()): WorkoutPatch {
  const patch: WorkoutPatch = {};
  const base = current.started_at ? new Date(current.started_at) : null;
  const baseValid = base && !Number.isNaN(base.getTime()) ? base : null;
  let date = current.date;
  let startedAt = current.started_at;

  if (change.date || change.time) {
    const [y, m, d] = (change.date ? localDateString(change.date) : current.date).split('-').map(Number);
    const clock = change.time ?? baseValid ?? new Date(2000, 0, 1, 12, 0);
    let start = new Date(y, m - 1, d, clock.getHours(), clock.getMinutes(), 0, 0);
    if (start.getTime() > now.getTime()) start = new Date(now.getTime());
    date = localDateString(start);
    startedAt = start.toISOString();
    patch.date = date;
    patch.started_at = startedAt;
  }
  const duration = change.duration_seconds !== undefined ? change.duration_seconds : current.duration_seconds;
  if (change.duration_seconds !== undefined) patch.duration_seconds = change.duration_seconds;

  if (startedAt && duration !== null && duration !== undefined) {
    patch.ended_at = new Date(new Date(startedAt).getTime() + duration * 1000).toISOString();
  }
  return patch;
}

// ── Live session focus ─────────────────────────────────────────

/** Ticked and total sets; tolerates a workout without exercises loaded. */
export function setProgress(w: { exercises?: { sets?: Pick<WorkoutSet, 'completed_at'>[] }[] } | null | undefined): {
  done: number;
  total: number;
} {
  let done = 0;
  let total = 0;
  for (const e of w?.exercises ?? []) {
    for (const s of e.sets ?? []) {
      total += 1;
      if (s.completed_at) done += 1;
    }
  }
  return { done, total };
}

export type LiveFocus = {
  currentExerciseId: string | null;
  activeSetId: string | null;
  /** Later exercises with no ticked set (shown collapsed). */
  upcomingIds: Set<string>;
};

/** The exercise being worked (first with an unticked set), its next set, and the exercises still to come. */
export function liveFocus(w: WorkoutWithExercises): LiveFocus {
  const exercises = w.exercises ?? [];
  const currentIndex = exercises.findIndex((e) => e.sets.some((s) => !s.completed_at));
  if (currentIndex < 0) return { currentExerciseId: null, activeSetId: null, upcomingIds: new Set() };
  const current = exercises[currentIndex];
  const active = current.sets.find((s) => !s.completed_at);
  const upcomingIds = new Set(
    exercises.slice(currentIndex + 1).filter((e) => !e.sets.some((s) => s.completed_at)).map((e) => e.id)
  );
  return { currentExerciseId: current.id, activeSetId: active?.id ?? null, upcomingIds };
}

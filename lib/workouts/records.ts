// Pure personal-records rules for weight_reps exercises.
// Records are derived from done-workout history and never stored.
import { formatWeightWithUnit } from '@/lib/units';
import { formatVolume } from '@/lib/workouts/summary';
import { setVolumeKg } from '@/lib/workouts/volume';
import type { ExerciseLogType, SetType, WeightUnit, WorkoutExerciseWithSets, WorkoutSet, WorkoutWithExercises } from '@/lib/types';

export type RecordKind = 'weight' | 'e1rm' | 'volume' | 'reps';

export type RecordValues = {
  weightKg: number | null;
  e1rmKg: number | null;
  volumeKg: number | null;
  reps: number | null;
};

export const EMPTY_RECORDS: RecordValues = {
  weightKg: null,
  e1rmKg: null,
  volumeKg: null,
  reps: null,
};

export type RecordSet = {
  setId: string;
  workoutId: string;
  exerciseId: string;
  at: string;
  position: number;
  weightKg: number | null;
  reps: number | null;
  setType: SetType;
  completedAt: string | null;
  logType: ExerciseLogType | null;
  perSide: boolean;
};

export type RecordHit = {
  kind: RecordKind;
  exerciseId: string;
  workoutId: string;
  setId: string;
  at: string;
  value: number;
};

const KIND_ORDER: RecordKind[] = ['weight', 'e1rm', 'volume', 'reps'];

function valueForKind(values: RecordValues, kind: RecordKind): number | null {
  switch (kind) {
    case 'weight':
      return values.weightKg;
    case 'e1rm':
      return values.e1rmKg;
    case 'volume':
      return values.volumeKg;
    case 'reps':
      return values.reps;
  }
}

/**
 * Epley 1RM estimate in kg, capped at 12 reps.
 * Returns null unless both values are finite, positive, and reps <= 12.
 * Returns weightKg when reps === 1, otherwise weightKg * (1 + reps / 30).
 */
export function estimatedOneRepMax(weightKg: number, reps: number): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return null;
  if (weightKg <= 0 || reps <= 0 || reps > 12) return null;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

function isEligibleSet(set: RecordSet): set is RecordSet & { weightKg: number; reps: number; logType: 'weight_reps' } {
  if (set.logType !== 'weight_reps') return false;
  if (set.setType === 'warmup') return false;
  if (!set.completedAt) return false;
  if (set.weightKg === null || !Number.isFinite(set.weightKg) || set.weightKg <= 0) return false;
  if (set.reps === null || !Number.isFinite(set.reps) || set.reps <= 0) return false;
  return true;
}

/**
 * The four record metrics for a single set, or all null when the set is ineligible.
 * Sets with reps > 12 still produce weightKg, volumeKg, and reps (with e1rmKg: null).
 */
export function recordValues(set: RecordSet): RecordValues {
  if (!isEligibleSet(set)) return { ...EMPTY_RECORDS };
  const vol = setVolumeKg(
    { weight_kg: set.weightKg, reps: set.reps, set_type: set.setType },
    { log_type: 'weight_reps', per_side: set.perSide ? 1 : 0 }
  );
  return {
    weightKg: set.weightKg,
    e1rmKg: estimatedOneRepMax(set.weightKg, set.reps),
    volumeKg: vol > 0 ? vol : null,
    reps: set.reps,
  };
}

function maxNullable(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/** Maximum of each metric across the given sets; nulls and ineligible sets are skipped. */
export function computeRecords(sets: RecordSet[]): RecordValues {
  let acc: RecordValues = { ...EMPTY_RECORDS };
  for (const s of sets) {
    const v = recordValues(s);
    acc = {
      weightKg: maxNullable(acc.weightKg, v.weightKg),
      e1rmKg: maxNullable(acc.e1rmKg, v.e1rmKg),
      volumeKg: maxNullable(acc.volumeKg, v.volumeKg),
      reps: maxNullable(acc.reps, v.reps),
    };
  }
  return acc;
}

/** Best record values keyed by exerciseId across the given sets. */
export function recordsByExercise(sets: RecordSet[]): Map<string, RecordValues> {
  const byEx = new Map<string, RecordSet[]>();
  for (const s of sets) {
    const list = byEx.get(s.exerciseId);
    if (list) list.push(s);
    else byEx.set(s.exerciseId, [s]);
  }
  const out = new Map<string, RecordValues>();
  for (const [exerciseId, list] of byEx) {
    out.set(exerciseId, computeRecords(list));
  }
  return out;
}

function beats(val: number | null, priorVal: number | null): val is number {
  if (val === null || !(val > 0)) return false;
  if (priorVal === null || !(priorVal > 0)) return true;
  return val > priorVal;
}

/**
 * The record kinds that `set` strictly beats against `prior`, in order: weight, e1rm, volume, reps.
 * A null prior field is beaten by any positive value.
 */
export function newRecordsFor(set: RecordSet, prior: RecordValues = EMPTY_RECORDS): RecordKind[] {
  const v = recordValues(set);
  const out: RecordKind[] = [];
  for (const kind of KIND_ORDER) {
    if (beats(valueForKind(v, kind), valueForKind(prior, kind))) {
      out.push(kind);
    }
  }
  return out;
}

/**
 * Per kind, the maximum among `sets` if that maximum strictly beats `prior`, else null.
 * Used for the finished-workout summary line.
 */
export function bestNewRecords(sets: RecordSet[], prior: RecordValues = EMPTY_RECORDS): RecordValues {
  const maxes = computeRecords(sets);
  return {
    weightKg: beats(maxes.weightKg, prior.weightKg) ? maxes.weightKg : null,
    e1rmKg: beats(maxes.e1rmKg, prior.e1rmKg) ? maxes.e1rmKg : null,
    volumeKg: beats(maxes.volumeKg, prior.volumeKg) ? maxes.volumeKg : null,
    reps: beats(maxes.reps, prior.reps) ? maxes.reps : null,
  };
}

/**
 * Formats beaten record values for the finished workout caption, or null when nothing was beaten.
 * E.g. "PR · Heaviest 100 kg" or
 * "PR · Heaviest 30 kg/side · Estimated 1RM 116.67 kg/side · Best set 1,200 kg · Most reps 12/side".
 */
export function formatRecordSummary(
  beaten: RecordValues,
  unit: WeightUnit,
  perSide: boolean
): string | null {
  const sideSuffix = perSide ? '/side' : '';
  const parts: string[] = [];
  if (beaten.weightKg !== null && beaten.weightKg > 0) {
    parts.push(`Heaviest ${formatWeightWithUnit(beaten.weightKg, unit)}${sideSuffix}`);
  }
  if (beaten.e1rmKg !== null && beaten.e1rmKg > 0) {
    parts.push(`Estimated 1RM ${formatWeightWithUnit(beaten.e1rmKg, unit)}${sideSuffix}`);
  }
  if (beaten.volumeKg !== null && beaten.volumeKg > 0) {
    parts.push(`Best set ${formatVolume(beaten.volumeKg, unit)} ${unit}`);
  }
  if (beaten.reps !== null && beaten.reps > 0) {
    parts.push(`Most reps ${beaten.reps}${sideSuffix}`);
  }
  if (parts.length === 0) return null;
  return `PR · ${parts.join(' · ')}`;
}

/** Maps a WorkoutSet and its exercise context to a RecordSet. */
export function recordSetFromWorkoutSet(input: {
  set: WorkoutSet;
  exerciseId: string;
  at: string;
  logType: ExerciseLogType | null;
  perSide: boolean;
}): RecordSet {
  const { set, exerciseId, at, logType, perSide } = input;
  return {
    setId: set.id,
    workoutId: set.workout_id,
    exerciseId,
    at,
    position: set.position,
    weightKg: set.weight_kg,
    reps: set.reps,
    setType: set.set_type,
    completedAt: set.completed_at,
    logType,
    perSide,
  };
}

function compareRecordSets(a: RecordSet, b: RecordSet): number {
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;
  if (a.position !== b.position) return a.position - b.position;
  if (a.setId !== b.setId) return a.setId < b.setId ? -1 : 1;
  return 0;
}

/**
 * Sorts sets chronologically (by `at`, then `position`, then `setId`), walks per `exerciseId`,
 * and emits a RecordHit whenever a set strictly beats the running best for a kind (or sets the first value).
 * One set can emit up to four hits, in kind order.
 */
export function collectRecordHits(sets: RecordSet[]): RecordHit[] {
  const sorted = [...sets].sort(compareRecordSets);
  const running = new Map<string, RecordValues>();
  const hits: RecordHit[] = [];

  for (const s of sorted) {
    const v = recordValues(s);
    if (v.weightKg === null && v.e1rmKg === null && v.volumeKg === null && v.reps === null) {
      continue;
    }
    const current = running.get(s.exerciseId) ?? { ...EMPTY_RECORDS };
    const next: RecordValues = { ...current };
    for (const kind of KIND_ORDER) {
      const candidate = valueForKind(v, kind);
      const best = valueForKind(current, kind);
      if (beats(candidate, best)) {
        hits.push({
          kind,
          exerciseId: s.exerciseId,
          workoutId: s.workoutId,
          setId: s.setId,
          at: s.at,
          value: candidate,
        });
        switch (kind) {
          case 'weight':
            next.weightKg = candidate;
            break;
          case 'e1rm':
            next.e1rmKg = candidate;
            break;
          case 'volume':
            next.volumeKg = candidate;
            break;
          case 'reps':
            next.reps = candidate;
            break;
        }
      }
    }
    running.set(s.exerciseId, next);
  }

  return hits;
}

/** Returns record hits newest first, sliced to `limit` (0 or less returns `[]`). */
export function recentRecordHits(sets: RecordSet[], limit: number): RecordHit[] {
  if (!(limit > 0)) return [];
  const hits = collectRecordHits(sets);
  return hits.reverse().slice(0, Math.floor(limit));
}

/** The exercise's sets as record sets, or null unless it is a weight_reps exercise. `at` is the workout's start. */
export function exerciseRecordSets(ex: WorkoutExerciseWithSets, at: string): RecordSet[] | null {
  const logType = ex.exercise?.log_type ?? null;
  if (logType !== 'weight_reps') return null;
  const perSide = !!ex.exercise?.per_side;
  return ex.sets.map((set) => recordSetFromWorkoutSet({ set, exerciseId: ex.exercise_id, at, logType, perSide }));
}

export type ExerciseRecordResult = {
  /** Best values this workout set above the history before it (null per kind when not beaten). */
  beaten: RecordValues;
  /** Record kinds per set id, only for sets that beat the prior history. */
  setKinds: Map<string, RecordKind[]>;
};

/**
 * Records set by each weight_reps exercise of the workout against `priors` (history before it).
 * Keyed by workout_exercise id. Empty while `priors` is null (still loading).
 */
export function workoutRecords(
  workout: WorkoutWithExercises,
  priors: Map<string, RecordValues> | null
): Map<string, ExerciseRecordResult> {
  const out = new Map<string, ExerciseRecordResult>();
  if (priors === null) return out;
  const at = workout.started_at ?? workout.created_at;
  for (const ex of workout.exercises ?? []) {
    const recordSets = exerciseRecordSets(ex, at);
    if (recordSets === null) continue;
    const prior = priors.get(ex.exercise_id) ?? EMPTY_RECORDS;
    const setKinds = new Map<string, RecordKind[]>();
    recordSets.forEach((rs) => {
      const kinds = newRecordsFor(rs, prior);
      if (kinds.length > 0) setKinds.set(rs.setId, kinds);
    });
    out.set(ex.id, { beaten: bestNewRecords(recordSets, prior), setKinds });
  }
  return out;
}

/** True when any record metric was beaten. */
export function hasBeaten(values: RecordValues): boolean {
  return values.weightKg !== null || values.e1rmKg !== null || values.volumeKg !== null || values.reps !== null;
}

/** Number of exercises that set at least one record (not the number of record kinds). */
export function countRecordExercises(
  workout: WorkoutWithExercises,
  priors: Map<string, RecordValues> | null
): number {
  let n = 0;
  for (const result of workoutRecords(workout, priors).values()) if (hasBeaten(result.beaten)) n += 1;
  return n;
}

/** "1 record" / "3 records"; null for zero. */
export function formatRecordCount(count: number): string | null {
  if (!(count > 0)) return null;
  return count === 1 ? '1 record' : `${count} records`;
}

/** The note under a record set: "Heaviest 75 kg", "Est. 1RM 128 lb", "Best set 1,200 kg", "Most reps 12". */
export function formatSetRecordNote(
  kind: RecordKind,
  set: Pick<WorkoutSet, 'weight_kg' | 'reps'>,
  unit: WeightUnit,
  perSide: boolean
): string | null {
  const side = perSide ? '/side' : '';
  const weightKg = set.weight_kg ?? 0;
  const reps = set.reps ?? 0;
  switch (kind) {
    case 'weight':
      return `Heaviest ${formatWeightWithUnit(weightKg, unit)}${side}`;
    case 'e1rm': {
      const e1rm = estimatedOneRepMax(weightKg, reps);
      return e1rm === null ? null : `Est. 1RM ${formatWeightWithUnit(e1rm, unit)}${side}`;
    }
    case 'volume': {
      const volume = setVolumeKg(
        { weight_kg: weightKg, reps, set_type: 'normal' },
        { log_type: 'weight_reps', per_side: perSide ? 1 : 0 }
      );
      return `Best set ${formatVolume(volume, unit)} ${unit}`;
    }
    case 'reps':
      return `Most reps ${reps}${side}`;
  }
}

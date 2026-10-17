// Pure state and rules for the guided exercise builder (no React, no I/O).
import { EQUIPMENT_LABELS, MUSCLE_LABELS, isRepLogType, logTypeLabel } from '@/lib/workouts/exercise-catalog';
import { formatWeight, lbToKg, parseDecimal } from '@/lib/units';
import type { Equipment, Exercise, ExerciseLogType, LoadType, MuscleGroup, WeightUnit } from '@/lib/types';

export type BuilderStepId =
  | 'equipment'
  | 'brand'
  | 'loading'
  | 'name'
  | 'muscles'
  | 'logtype'
  | 'notes'
  | 'review';

export type BuilderDraft = {
  equipment: Equipment | null;
  brand: string;
  loadType: LoadType;
  /** Starting (sled) weight as typed, in the display unit. */
  sled: string;
  name: string;
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  logType: ExerciseLogType;
  perSide: boolean;
  notes: string;
  /** Name of the built-in exercise whose muscles and log type were copied, or ''. */
  copiedFrom: string;
};

/** Fields written to the `exercises` table by create and update. */
export type ExerciseInput = {
  name: string;
  log_type: ExerciseLogType;
  primary_muscles: MuscleGroup[];
  secondary_muscles: MuscleGroup[];
  equipment: Equipment;
  brand: string | null;
  load_type: LoadType | null;
  base_weight_kg: number | null;
  per_side: 0 | 1;
  setup_notes: string | null;
};

/** Common short words that should not trigger a suggestion on their own. */
const STOPWORDS = new Set(['the', 'and', 'with', 'for', 'from']);

const BRAND_EQUIPMENT: readonly Equipment[] = ['machine', 'cable', 'cardio_machine'];

export function hasBrandStep(equipment: Equipment | null): boolean {
  return equipment !== null && BRAND_EQUIPMENT.includes(equipment);
}

export function emptyDraft(name = ''): BuilderDraft {
  return {
    equipment: null,
    brand: '',
    loadType: 'stack',
    sled: '',
    name,
    primary: [],
    secondary: [],
    logType: 'weight_reps',
    perSide: false,
    notes: '',
    copiedFrom: '',
  };
}

/** Draft for editing a custom exercise. The sled weight is shown in the display unit. */
export function exerciseToDraft(e: Exercise, unit: WeightUnit): BuilderDraft {
  return {
    equipment: e.equipment,
    brand: e.brand ?? '',
    loadType: e.load_type ?? 'stack',
    sled: e.base_weight_kg ? formatWeight(e.base_weight_kg, unit) : '',
    name: e.name,
    primary: [...e.primary_muscles],
    secondary: [...e.secondary_muscles],
    logType: e.log_type,
    perSide: !!e.per_side && isRepLogType(e.log_type),
    notes: e.setup_notes ?? '',
    copiedFrom: '',
  };
}

/** Steps shown for the draft's equipment, in order. */
export function builderSteps(draft: BuilderDraft): BuilderStepId[] {
  const steps: BuilderStepId[] = ['equipment'];
  if (hasBrandStep(draft.equipment)) steps.push('brand');
  if (draft.equipment === 'machine') steps.push('loading');
  steps.push('name', 'muscles', 'logtype', 'notes', 'review');
  return steps;
}

/** True when the sled field is empty or a valid non-negative number. */
function sledOk(draft: BuilderDraft): boolean {
  return draft.sled.trim() === '' || parseDecimal(draft.sled) !== null;
}

export function isStepValid(draft: BuilderDraft, step: BuilderStepId): boolean {
  switch (step) {
    case 'equipment':
      return draft.equipment !== null;
    case 'loading':
      return draft.loadType !== 'plate' || sledOk(draft);
    case 'name':
      return draft.name.trim().length > 0;
    case 'muscles':
      return draft.primary.length > 0;
    case 'review':
      return validateDraft(draft).ok;
    default:
      return true;
  }
}

/** The first step (in order) that blocks saving, or null when the draft is valid. */
export function firstInvalidStep(draft: BuilderDraft): BuilderStepId | null {
  for (const step of builderSteps(draft)) {
    if (step !== 'review' && !isStepValid(draft, step)) return step;
  }
  return null;
}

export function validateDraft(draft: BuilderDraft): { ok: boolean; step: BuilderStepId | null } {
  const step = firstInvalidStep(draft);
  return { ok: step === null, step };
}

/** Footer button label: "Skip" for an empty optional step, "Save exercise" / "Save changes" on review. */
export function primaryLabel(
  draft: BuilderDraft,
  step: BuilderStepId,
  editing = false
): 'Next' | 'Skip' | 'Save exercise' | 'Save changes' {
  if (step === 'review') return editing ? 'Save changes' : 'Save exercise';
  if (step === 'brand' && !draft.brand.trim()) return 'Skip';
  if (step === 'notes' && !draft.notes.trim()) return 'Skip';
  return 'Next';
}

/** Picks the log type, dropping "per side" when the type is not rep-based. */
export function applyLogType(draft: BuilderDraft, logType: ExerciseLogType): BuilderDraft {
  return { ...draft, logType, perSide: draft.perSide && isRepLogType(logType) };
}

/**
 * Picks the equipment. Sets the default log type (cardio machine: distance + time; bodyweight:
 * bodyweight + reps; otherwise those two fall back to weight × reps) and clears the brand when the
 * equipment has no brand step.
 */
export function applyEquipment(draft: BuilderDraft, equipment: Equipment): BuilderDraft {
  if (draft.equipment === equipment) return draft;
  let logType = draft.logType;
  if (equipment === 'cardio_machine') logType = 'distance_duration';
  else if (equipment === 'bodyweight') logType = 'bodyweight_reps';
  else if (logType === 'distance_duration' || logType === 'bodyweight_reps') logType = 'weight_reps';
  return applyLogType(
    { ...draft, equipment, brand: hasBrandStep(equipment) ? draft.brand : '' },
    logType
  );
}

/** Adds or removes a muscle in one list; a muscle is never both primary and secondary. */
export function toggleMuscle(
  draft: BuilderDraft,
  which: 'primary' | 'secondary',
  muscle: MuscleGroup
): BuilderDraft {
  const other = which === 'primary' ? 'secondary' : 'primary';
  const has = draft[which].includes(muscle);
  return {
    ...draft,
    [which]: has ? draft[which].filter((m) => m !== muscle) : [...draft[which], muscle],
    [other]: draft[other].filter((m) => m !== muscle),
  };
}

/** Typing in the name field drops the "copied from" hint. */
export function setDraftName(draft: BuilderDraft, name: string): BuilderDraft {
  return { ...draft, name, copiedFrom: '' };
}

type SeedLike = Pick<Exercise, 'name' | 'primary_muscles' | 'secondary_muscles' | 'log_type'>;

/** Up to 3 built-in exercises sharing a word (3+ letters) with the name, never an exact match. */
export function nameSuggestions<T extends SeedLike>(name: string, seeds: readonly T[]): T[] {
  const typed = name.trim().toLowerCase();
  const tokens = typed.split(/\s+/).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  if (tokens.length === 0) return [];
  return seeds
    .map((s, i) => {
      const n = s.name.toLowerCase();
      return { s, i, n, hits: tokens.filter((t) => n.includes(t)).length };
    })
    .filter((x) => x.hits > 0 && x.n !== typed)
    .sort((a, b) => b.hits - a.hits || a.i - b.i)
    .slice(0, 3)
    .map((x) => x.s);
}

/** Copies the suggestion's muscles and log type. */
export function applySuggestion(draft: BuilderDraft, seed: SeedLike): BuilderDraft {
  return applyLogType(
    {
      ...draft,
      primary: [...seed.primary_muscles],
      secondary: [...seed.secondary_muscles],
      copiedFrom: seed.name,
    },
    seed.log_type
  );
}

export function isPlateLoaded(draft: BuilderDraft): boolean {
  return draft.equipment === 'machine' && draft.loadType === 'plate';
}

function sledKg(draft: BuilderDraft, unit: WeightUnit): number | null {
  if (!isPlateLoaded(draft)) return null;
  const typed = parseDecimal(draft.sled);
  if (typed === null || typed <= 0) return null;
  return unit === 'kg' ? typed : lbToKg(typed);
}

export function loadingText(draft: BuilderDraft, unit: WeightUnit): string {
  if (draft.loadType !== 'plate') return 'Weight stack';
  const typed = parseDecimal(draft.sled);
  return typed && typed > 0 ? `Plate-loaded, ${formatWeight(unit === 'kg' ? typed : lbToKg(typed), unit)} ${unit} sled` : 'Plate-loaded';
}

export function musclesText(draft: Pick<BuilderDraft, 'primary' | 'secondary'>): string {
  const primary = draft.primary.map((m) => MUSCLE_LABELS[m]).join(', ');
  const secondary = draft.secondary.map((m) => MUSCLE_LABELS[m]).join(', ');
  return primary + (secondary ? ` · also ${secondary}` : '');
}

export function loggedAsText(draft: BuilderDraft): string {
  return logTypeLabel(draft.logType) + (draft.perSide && isRepLogType(draft.logType) ? ', per side' : '');
}

export type ReviewRowData = { step: BuilderStepId; label: string; value: string };

/** Review card lines; each one jumps back to its step. */
export function reviewRows(draft: BuilderDraft, unit: WeightUnit): ReviewRowData[] {
  const steps = builderSteps(draft);
  const rows: ReviewRowData[] = [
    { step: 'equipment', label: 'Equipment', value: draft.equipment ? EQUIPMENT_LABELS[draft.equipment] : '' },
  ];
  if (steps.includes('brand')) rows.push({ step: 'brand', label: 'Brand', value: draft.brand.trim() || 'None' });
  if (steps.includes('loading')) rows.push({ step: 'loading', label: 'Loading', value: loadingText(draft, unit) });
  rows.push(
    { step: 'name', label: 'Name', value: draft.name.trim() },
    { step: 'muscles', label: 'Muscles', value: musclesText(draft) },
    { step: 'logtype', label: 'Logged as', value: loggedAsText(draft) },
    { step: 'notes', label: 'Setup notes', value: draft.notes.trim() || 'None' }
  );
  return rows;
}

/** "Name · Brand" for the draft; "Untitled" until a name is typed. */
export function draftDisplayName(draft: BuilderDraft): string {
  const name = draft.name.trim() || 'Untitled';
  const brand = hasBrandStep(draft.equipment) ? draft.brand.trim() : '';
  return brand ? `${name} · ${brand}` : name;
}

/** One-line summary for the saved card: "Machine · Chest · Weight × reps, per side". */
export function draftSummary(draft: BuilderDraft): string {
  const equipment = draft.equipment ? EQUIPMENT_LABELS[draft.equipment] : '';
  const primary = draft.primary.map((m) => MUSCLE_LABELS[m]).join(', ');
  return [equipment, primary, loggedAsText(draft)].filter(Boolean).join(' · ');
}

/**
 * Converts a valid draft to the stored fields. Brand, load type and sled weight are null when the
 * equipment does not use them; per side is 0 for non-rep log types; the sled weight is stored in kg.
 * Throws when the draft is invalid (check `validateDraft` first).
 */
export function draftToExerciseInput(draft: BuilderDraft, unit: WeightUnit): ExerciseInput {
  if (!validateDraft(draft).ok || draft.equipment === null) throw new Error('Exercise draft is incomplete');
  const brand = hasBrandStep(draft.equipment) ? draft.brand.trim() : '';
  const plate = isPlateLoaded(draft);
  return {
    name: draft.name.trim(),
    log_type: draft.logType,
    primary_muscles: [...draft.primary],
    secondary_muscles: [...draft.secondary],
    equipment: draft.equipment,
    brand: brand || null,
    load_type: draft.equipment === 'machine' ? draft.loadType : null,
    base_weight_kg: plate ? sledKg(draft, unit) : null,
    per_side: draft.perSide && isRepLogType(draft.logType) ? 1 : 0,
    setup_notes: draft.notes.trim() || null,
  };
}

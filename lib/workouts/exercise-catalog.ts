// Pure helpers for the exercise library: labels, regions, search and display strings.
import type { Equipment, Exercise, ExerciseLogType, MuscleGroup } from '@/lib/types';

// Muscle ids are stored in exercises and synced, so they keep their original names. The labels
// changed: `upper_back` shows as Traps, `lower_back` as Erectors and `abs` as Abdominals.
export const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  'chest',
  'front_delts',
  'side_delts',
  'rear_delts',
  'triceps',
  'biceps',
  'forearms',
  'lats',
  'upper_back',
  'lower_back',
  'abs',
  'glutes',
  'abductors',
  'quads',
  'hamstrings',
  'adductors',
  'calves',
  'full_body',
  'cardio',
];

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  front_delts: 'Front delts',
  side_delts: 'Side delts',
  rear_delts: 'Rear delts',
  triceps: 'Triceps',
  biceps: 'Biceps',
  forearms: 'Forearms',
  lats: 'Lats',
  upper_back: 'Traps',
  lower_back: 'Erectors',
  abs: 'Abdominals',
  glutes: 'Glutes',
  abductors: 'Abductors',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  adductors: 'Adductors',
  calves: 'Calves',
  full_body: 'Full body',
  cardio: 'Cardio',
};

export const EQUIPMENT_OPTIONS: readonly Equipment[] = [
  'machine',
  'cable',
  'barbell',
  'dumbbell',
  'bodyweight',
  'cardio_machine',
  'other',
];

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  machine: 'Machine',
  cable: 'Cable',
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  bodyweight: 'Bodyweight',
  cardio_machine: 'Cardio machine',
  other: 'Other',
};

export const LOG_TYPE_OPTIONS: readonly { id: ExerciseLogType; label: string; desc: string }[] = [
  { id: 'weight_reps', label: 'Weight × reps', desc: 'Load and reps for each set' },
  { id: 'bodyweight_reps', label: 'Bodyweight + reps', desc: 'Reps, with optional added weight' },
  { id: 'assisted', label: 'Assisted', desc: 'Assistance weight and reps' },
  { id: 'duration', label: 'Time', desc: 'How long each set lasts' },
  { id: 'distance_duration', label: 'Distance + time', desc: 'Pace is calculated for you' },
];

/** Log types measured in reps; only these can be logged per side. */
export const REP_LOG_TYPES: readonly ExerciseLogType[] = ['weight_reps', 'bodyweight_reps', 'assisted'];

export function isRepLogType(type: ExerciseLogType): boolean {
  return REP_LOG_TYPES.includes(type);
}

export function logTypeLabel(type: ExerciseLogType): string {
  return LOG_TYPE_OPTIONS.find((o) => o.id === type)?.label ?? type;
}

export type Region =
  | 'All'
  | 'Chest'
  | 'Shoulders'
  | 'Triceps'
  | 'Biceps'
  | 'Forearms'
  | 'Lats'
  | 'Traps'
  | 'Erectors'
  | 'Abdominals'
  | 'Glutes'
  | 'Quads'
  | 'Hamstrings'
  | 'Adductors'
  | 'Calves'
  | 'Cardio';
export const REGIONS: readonly Region[] = [
  'All',
  'Chest',
  'Shoulders',
  'Triceps',
  'Biceps',
  'Forearms',
  'Lats',
  'Traps',
  'Erectors',
  'Abdominals',
  'Glutes',
  'Quads',
  'Hamstrings',
  'Adductors',
  'Calves',
  'Cardio',
];

/** Body region of a muscle. `full_body` belongs to no region (it only appears under All). */
export const MUSCLE_REGION: Record<MuscleGroup, Exclude<Region, 'All'> | null> = {
  chest: 'Chest',
  front_delts: 'Shoulders',
  side_delts: 'Shoulders',
  rear_delts: 'Shoulders',
  triceps: 'Triceps',
  biceps: 'Biceps',
  forearms: 'Forearms',
  lats: 'Lats',
  upper_back: 'Traps',
  lower_back: 'Erectors',
  abs: 'Abdominals',
  glutes: 'Glutes',
  abductors: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  adductors: 'Adductors',
  calves: 'Calves',
  cardio: 'Cardio',
  full_body: null,
};

type NamedExercise = Pick<Exercise, 'name' | 'brand'>;

/** "Name · Brand" (just the name without a brand). */
export function exerciseDisplayName(e: NamedExercise): string {
  const brand = e.brand?.trim();
  return brand ? `${e.name} · ${brand}` : e.name;
}

function sentenceCase(labels: string[]): string {
  const joined = labels.map((l) => l.toLowerCase()).join(', ');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/** "Chest, triceps · per side · Seat 4": up to two muscles, then per side, then setup notes. */
export function exerciseSubtitle(
  e: Pick<Exercise, 'primary_muscles' | 'secondary_muscles' | 'per_side' | 'setup_notes'>
): string {
  const muscles = Array.from(new Set([...e.primary_muscles, ...e.secondary_muscles])).slice(0, 2);
  const parts: string[] = [];
  if (muscles.length > 0) parts.push(sentenceCase(muscles.map((m) => MUSCLE_LABELS[m] ?? m)));
  if (e.per_side) parts.push('per side');
  const notes = e.setup_notes?.trim();
  if (notes) parts.push(notes);
  return parts.join(' · ');
}

export type ExerciseFilter = {
  query?: string;
  region?: Region;
  /** Keep only exercises of this brand (case-insensitive); null or undefined means all. */
  brand?: string | null;
  /** Extra search terms by exercise id (the seed machine aliases). */
  aliases?: ReadonlyMap<string, readonly string[]>;
};

function tokensOf(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/** 0 exact, 1 prefix, 2 word prefix, 3 substring, 4 matched through the brand only. */
function matchTier(name: string, query: string): number {
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.split(/\s+/).some((w) => w.startsWith(query))) return 2;
  if (name.includes(query)) return 3;
  return 4;
}

/**
 * Filters and ranks exercises. Every query token must match the name, brand or an alias. Ranking
 * on the tokens that are not part of the brand: exact, prefix, word prefix, substring (name or
 * alias), then brand-only matches, then alphabetical. The region compares `primary_muscles[0]`;
 * `brand` keeps one brand. Hidden and deleted exercises are excluded.
 */
export function filterExercises(list: readonly Exercise[], filter: ExerciseFilter = {}): Exercise[] {
  const query = (filter.query ?? '').trim().toLowerCase();
  const tokens = tokensOf(query);
  const region = filter.region ?? 'All';
  const brand = filter.brand?.trim().toLowerCase() || null;
  const aliasesOf = (e: Exercise) => (filter.aliases?.get(e.id) ?? []).map((a) => a.toLowerCase());

  const matched = list.filter((e) => {
    if (e.hidden || e.deleted_at) return false;
    if (region !== 'All') {
      const first = e.primary_muscles[0];
      if (!first || MUSCLE_REGION[first] !== region) return false;
    }
    if (brand && e.brand?.trim().toLowerCase() !== brand) return false;
    if (tokens.length === 0) return true;
    const hay = `${e.name} ${e.brand ?? ''} ${aliasesOf(e).join(' ')}`.toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });

  const byName = (a: Exercise, b: Exercise) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);
  if (tokens.length === 0) return matched.sort(byName);

  const tier = new Map<string, number>();
  for (const e of matched) {
    const brandText = (e.brand ?? '').toLowerCase();
    const nameQuery = tokens.filter((tk) => !brandText.split(/\s+/).some((w) => w.startsWith(tk))).join(' ');
    if (!nameQuery) {
      tier.set(e.id, 4);
      continue;
    }
    const best = [e.name.toLowerCase(), ...aliasesOf(e)].map((n) => matchTier(n, nameQuery));
    tier.set(e.id, Math.min(...best));
  }
  return matched.sort((a, b) => (tier.get(a.id)! - tier.get(b.id)!) || byName(a, b));
}

/** Custom exercises first ("Your exercises"), then built-ins ("All exercises"). Order is kept. */
export function splitSections(list: readonly Exercise[]): { yours: Exercise[]; all: Exercise[] } {
  return {
    yours: list.filter((e) => e.source === 'custom'),
    all: list.filter((e) => e.source !== 'custom'),
  };
}

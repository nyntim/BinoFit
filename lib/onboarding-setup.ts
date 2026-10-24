import { macroEnergyShares, targetPercentage } from '@/lib/meal-nutrition-summary';
import { centimetresToFeetInches, feetInchesToCentimetres, formatWeight, lbToKg, parseDecimal } from '@/lib/units';
import { weightInputToKg, weightRangeMessage } from '@/lib/weight';
import type { UserProfile, WeightUnit } from '@/lib/types';

export type ActivityLevel = NonNullable<UserProfile['activity_level']>;

export const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; description: string }[] = [
  { value: 'sedentary', label: 'Sedentary', description: 'Desk job, little exercise' },
  { value: 'light', label: 'Light', description: '1–3 days/week' },
  { value: 'moderate', label: 'Moderate', description: '3–5 days/week' },
  { value: 'active', label: 'Active', description: '6–7 days/week' },
  { value: 'very_active', label: 'Very active', description: 'Physical job plus training' },
];

/** What the About you step is editing. Both height representations are kept so a unit switch loses nothing. */
export type StatsDraft = {
  weight: string;
  heightCm: string;
  feet: string;
  inches: string;
  activity: ActivityLevel | null;
};

/** The values loaded when the screen opened, used to detect untouched fields. */
export type StatsOriginal = {
  profile: UserProfile | null;
  draft: StatsDraft;
  weightKg: number | null;
};

export function statsDraftFrom(
  profile: UserProfile | null,
  latestKg: number | null,
  unit: WeightUnit,
  defaultActivity: ActivityLevel | null,
): StatsDraft {
  const kg = latestKg ?? profile?.weight ?? null;
  const height = profile?.height ?? null;
  const imperial = height === null ? null : centimetresToFeetInches(height);
  return {
    weight: kg === null ? '' : formatWeight(kg, unit),
    heightCm: height === null ? '' : String(height),
    feet: imperial ? String(imperial.feet) : '',
    inches: imperial ? String(imperial.inches) : '',
    activity: profile?.activity_level ?? defaultActivity,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Re-expresses typed weight and height in the new unit. Untouched fields come from the stored values. */
export function convertStatsDraft(
  draft: StatsDraft,
  original: StatsOriginal,
  from: WeightUnit,
  to: WeightUnit,
): { draft: StatsDraft; original: StatsOriginal } {
  if (from === to) return { draft, original };
  const nextOriginalWeight = original.weightKg === null ? '' : formatWeight(original.weightKg, to);
  const nextOriginal: StatsOriginal = { ...original, draft: { ...original.draft, weight: nextOriginalWeight } };

  const weightUnchanged = draft.weight === original.draft.weight;
  let weight = draft.weight;
  if (weightUnchanged) weight = nextOriginalWeight;
  else {
    const typed = parseDecimal(draft.weight);
    if (typed !== null) weight = formatWeight(from === 'kg' ? typed : lbToKg(typed), to);
  }

  const heightUnchanged = from === 'kg'
    ? draft.heightCm === original.draft.heightCm
    : draft.feet === original.draft.feet && draft.inches === original.draft.inches;
  let { heightCm, feet, inches } = draft;
  if (heightUnchanged) {
    ({ heightCm, feet, inches } = original.draft);
  } else if (from === 'kg') {
    const cm = Number(heightCm);
    if (heightCm.trim() && Number.isFinite(cm) && cm > 0) {
      const converted = centimetresToFeetInches(cm);
      feet = String(converted.feet);
      inches = String(converted.inches);
    }
  } else {
    const cm = feetInchesToCentimetres(feet.trim() ? Number(feet) : 0, inches.trim() ? (parseDecimal(inches) ?? NaN) : 0);
    if (cm !== null && cm > 0) heightCm = String(round2(cm));
  }

  return { draft: { ...draft, weight, heightCm, feet, inches }, original: nextOriginal };
}

export type StatsValidation =
  | { ok: true; weightKg: number | null; weightChanged: boolean; heightCm: number | null; heightChanged: boolean }
  | { ok: false; field: 'weight' | 'height'; message: string };

export const FEET_INCHES_RANGE_MESSAGE = 'Use whole feet and inches from 0 to less than 12.';

export function validateStats(draft: StatsDraft, original: StatsOriginal, unit: WeightUnit): StatsValidation {
  // Preserve the saved kg value before validating rounded display text at either limit.
  const weightUnchanged = draft.weight === original.draft.weight;
  let weightKg: number | null = weightUnchanged ? original.weightKg : null;
  if (!weightUnchanged && draft.weight.trim()) {
    weightKg = weightInputToKg(draft.weight, unit);
    if (weightKg === null) return { ok: false, field: 'weight', message: weightRangeMessage(unit) };
  }

  const storedCm = original.profile?.height ?? null;
  let heightCm: number | null;
  if (unit === 'kg') {
    heightCm = draft.heightCm.trim() ? Number(draft.heightCm) : null;
    if (heightCm !== null && (!Number.isFinite(heightCm) || heightCm <= 0)) {
      return { ok: false, field: 'height', message: 'Enter a positive height in cm.' };
    }
  } else if (!draft.feet.trim() && !draft.inches.trim()) {
    heightCm = null;
  } else if (draft.feet === original.draft.feet && draft.inches === original.draft.inches) {
    heightCm = storedCm;
  } else {
    const inches = draft.inches.trim() ? parseDecimal(draft.inches) : 0;
    const feet = draft.feet.trim() ? Number(draft.feet) : 0;
    const cm = inches === null ? null : feetInchesToCentimetres(feet, inches);
    if (cm === null) return { ok: false, field: 'height', message: FEET_INCHES_RANGE_MESSAGE };
    if (cm <= 0) return { ok: false, field: 'height', message: 'Enter a positive height in feet and inches.' };
    heightCm = cm;
  }

  return {
    ok: true,
    weightKg,
    weightChanged: !weightUnchanged && weightKg !== null,
    heightCm,
    heightChanged: heightCm !== storedCm,
  };
}

export type MacroName = 'protein' | 'carbs' | 'fat';
export type MacroSummary = { grams: number; kcal: number; percentOfCalories: number | null };

function nonNegative(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Live numbers under the daily targets: percent of calories per macro and the energy split. */
export function targetsSummary({ calories, protein, carbs, fat }: Record<'calories' | 'protein' | 'carbs' | 'fat', string>) {
  const cal = nonNegative(calories);
  const grams = { protein: nonNegative(protein), carbs: nonNegative(carbs), fat: nonNegative(fat) };
  const kcalPer = { protein: 4, carbs: 4, fat: 9 };
  const macros = {} as Record<MacroName, MacroSummary>;
  for (const name of ['protein', 'carbs', 'fat'] as const) {
    const kcal = grams[name] * kcalPer[name];
    const percent = targetPercentage(kcal, cal);
    macros[name] = { grams: grams[name], kcal, percentOfCalories: percent === null ? null : Math.round(percent) };
  }
  const macroCalories = Math.round(macros.protein.kcal + macros.carbs.kcal + macros.fat.kcal);
  const energyShares = macroEnergyShares(grams);
  const barLabel = energyShares
    ? `Protein ${Math.round(energyShares.protein)} percent, carbs ${Math.round(energyShares.carbs)} percent, fat ${Math.round(energyShares.fat)} percent`
    : 'No macros entered';
  return { macros, macroCalories, energyShares, barLabel };
}

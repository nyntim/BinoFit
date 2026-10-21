import type { UserProfile, WeightUnit } from '@/lib/types';
import { formatWeight, parseDecimal, lbToKg, centimetresToFeetInches, feetInchesToCentimetres } from '@/lib/units';
export const ACTIVITY_OPTIONS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
export type ProfileDraft = { weight: string; height: string; feet: string; inches: string; activity: UserProfile['activity_level'] };
export function profileDraft(profile: UserProfile | null, weightKg: number | null, unit: WeightUnit): ProfileDraft {
  const imperial = profile?.height == null ? null : centimetresToFeetInches(profile.height);
  return { weight: weightKg == null ? '' : formatWeight(weightKg, unit), height: profile?.height == null ? '' : String(Math.round(profile.height * 100) / 100), feet: imperial == null ? '' : String(imperial.feet), inches: imperial == null ? '' : String(imperial.inches), activity: profile?.activity_level ?? null };
}
export function validateProfileDraft(draft: ProfileDraft, base: ProfileDraft, unit: WeightUnit): { weightKg: number | null; weightChanged: boolean; heightCm: number | null; heightChanged: boolean; activity: UserProfile['activity_level'] } {
  const weightChanged = draft.weight.trim() !== base.weight.trim();
  const parsedWeight = parseDecimal(draft.weight);
  const candidate = parsedWeight == null ? null : unit === 'kg' ? parsedWeight : lbToKg(parsedWeight);
  const weightKg = candidate != null && candidate >= 20 && candidate <= 400 ? candidate : null;
  if (weightChanged && draft.weight.trim() && weightKg == null) throw new Error('Enter a weight between 20 and 400 kg, or its equivalent in lb.');
  const heightChanged = unit === 'kg' ? draft.height !== base.height : draft.feet !== base.feet || draft.inches !== base.inches;
  let heightCm: number | null = null;
  if (unit === 'kg') {
    if (draft.height.trim()) { heightCm = parseDecimal(draft.height); if (heightCm == null) throw new Error('Enter a valid height in cm.'); }
  } else if (draft.feet.trim() || draft.inches.trim()) {
    const feet = parseDecimal(draft.feet || '0');
    const inches = parseDecimal(draft.inches || '0');
    if (feet == null || !Number.isInteger(feet) || inches == null || inches >= 12) throw new Error('Use whole feet and inches from 0 to less than 12.');
    heightCm = feetInchesToCentimetres(feet, inches);
  }
  if (heightCm != null && (!Number.isFinite(heightCm) || heightCm < 50 || heightCm > 300)) throw new Error('Enter a height between 50 and 300 cm, or its equivalent in feet and inches.');
  if (draft.activity != null && !ACTIVITY_OPTIONS.includes(draft.activity)) throw new Error('Choose a valid activity level.');
  return { weightKg, weightChanged, heightCm, heightChanged, activity: draft.activity };
}

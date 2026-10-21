// Pure unit helpers. Weight is stored in kg and distance in metres; these convert for display.
import type { WeightUnit } from '@/lib/types';

const KG_PER_LB = 0.45359237;
const M_PER_KM = 1000;
const M_PER_MI = 1609.344;

export type DistanceUnit = 'km' | 'mi';

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

/** Distance follows the weight unit: kg uses km, lb uses mi. */
export function distanceUnitFor(unit: WeightUnit): DistanceUnit {
  return unit === 'kg' ? 'km' : 'mi';
}

export function metresToDisplay(metres: number, unit: WeightUnit): number {
  return metres / (unit === 'kg' ? M_PER_KM : M_PER_MI);
}

export function displayToMetres(value: number, unit: WeightUnit): number {
  return value * (unit === 'kg' ? M_PER_KM : M_PER_MI);
}

/** Rounds to at most 2 decimals and trims trailing zeros. */
function trimDecimals(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** Number only, in the display unit (e.g. "135" or "72.5"). */
export function formatWeight(kg: number, unit: WeightUnit): string {
  return trimDecimals(unit === 'kg' ? kg : kgToLb(kg));
}

/** Number plus unit label (e.g. "72.5 kg"). */
export function formatWeightWithUnit(kg: number, unit: WeightUnit): string {
  return `${formatWeight(kg, unit)} ${unit}`;
}

/** Parses user-typed decimals; accepts a comma. Null for empty, negative or non-numeric input. */
export function parseDecimal(input: string): number | null {
  const t = input.trim().replace(',', '.');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Seconds per display-unit distance (per km or per mi). Null when distance or duration is not positive. */
export function pace(distanceM: number, durationS: number, unit: WeightUnit): number | null {
  if (!(distanceM > 0) || !(durationS > 0)) return null;
  return durationS / metresToDisplay(distanceM, unit);
}

/** m:ss, or h:mm:ss from one hour. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** e.g. "5:30 /km"; "--" when there is no pace. */
export function formatPace(paceSeconds: number | null, unit: WeightUnit): string {
  if (paceSeconds === null) return '--';
  return `${formatDuration(paceSeconds)} /${distanceUnitFor(unit)}`;
}

/** Height is stored in cm, independently of the display preference. */
export function centimetresToFeetInches(cm: number): { feet: number; inches: number } {
  const total = Math.round(cm / 2.54 * 100) / 100;
  return { feet: Math.floor(total / 12), inches: Math.round(total % 12 * 100) / 100 };
}
export function feetInchesToCentimetres(feet: number, inches: number): number | null {
  if (!Number.isInteger(feet) || feet < 0 || !Number.isFinite(inches) || inches < 0 || inches >= 12) return null;
  return (feet * 12 + inches) * 2.54;
}

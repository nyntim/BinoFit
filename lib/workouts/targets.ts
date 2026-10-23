import { REGIONS } from '@/lib/workouts/exercise-catalog';
import type { VolumeTargetRegion, WeeklyVolumeTargets } from '@/lib/types';
import type { MuscleSetTotal } from '@/lib/workouts/summary';

export const TARGET_REGIONS = REGIONS.filter((r): r is VolumeTargetRegion => r !== 'All' && r !== 'Cardio');
export const STARTER_TARGETS: WeeklyVolumeTargets = { Chest: 10, Shoulders: 10, Lats: 10, Glutes: 10, Quads: 10, Hamstrings: 10 };

export function normalizeVolumeTargets(value: unknown): WeeklyVolumeTargets {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: WeeklyVolumeTargets = {};
  for (const region of TARGET_REGIONS) {
    const target = (value as Record<string, unknown>)[region];
    if (typeof target === 'number' && Number.isInteger(target) && target >= 1 && target <= 40) result[region] = target;
  }
  return result;
}

/** Blank and zero clear a target. Other values must be whole sets from 1 to 40. */
export function parseVolumeTarget(input: string): number | null {
  const value = input.trim();
  if (value === '' || value === '0') return null;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 40) throw new Error('Enter a whole number from 1 to 40, or leave blank to clear.');
  return Number(value);
}

export type VolumeTargetProgress = MuscleSetTotal & { target: number | null; status: 'none' | 'under' | 'met' | 'over' };
export function volumeTargetProgress(counts: MuscleSetTotal[], value: unknown): VolumeTargetProgress[] {
  const targets = normalizeVolumeTargets(value);
  return REGIONS.filter(r => r !== 'All').map(region => {
    const sets = counts.find(row => row.region === region)?.sets ?? 0;
    const target = region === 'Cardio' ? null : targets[region] ?? null;
    const status: VolumeTargetProgress['status'] = target === null ? 'none' : sets < target ? 'under' : sets === target ? 'met' : 'over';
    return { region, sets, target, status };
  }).filter(row => row.sets > 0 || row.target !== null).sort((a, b) => b.sets - a.sets);
}

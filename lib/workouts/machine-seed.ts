// Built-in branded gym machines: a hand-curated template list crossed with per-brand lineups.
// Names are descriptive only (no product line or model names); brand names say who makes the
// machine. Ids are `<brand-slug>-<template-key>` and never change once shipped: rename only the
// `name`, and drop a row to hide it (the seed pipeline hides ids missing from the list).
import type { Equipment, ExerciseLogType, LoadType, MuscleGroup } from '@/lib/types';
import { COMMON_MACHINE_BRANDS } from '@/lib/workouts/exercise-builder';
import { MUSCLE_REGION } from '@/lib/workouts/exercise-catalog';
import type { SeedExercise } from '@/lib/workouts/exercise-seed';

export type MachineBrand = (typeof COMMON_MACHINE_BRANDS)[number];

export type MachineTemplate = {
  name: string;
  equipment: Equipment;
  log_type: ExerciseLogType;
  load_type: LoadType | null;
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  per_side: 0 | 1;
  rest: number | null;
  met: number;
  aliases: string[];
};

type T = (
  name: string,
  equipment: Equipment,
  load: LoadType | null,
  log: ExerciseLogType,
  primary: MuscleGroup[],
  secondary: MuscleGroup[],
  rest: number | null,
  met: number,
  aliases: string[],
  perSide?: 0 | 1
) => MachineTemplate;

const t: T = (name, equipment, load_type, log_type, primary, secondary, rest, met, aliases, per_side = 0) => ({
  name,
  equipment,
  load_type,
  log_type,
  primary,
  secondary,
  per_side,
  rest,
  met,
  aliases,
});

const W: ExerciseLogType = 'weight_reps';

// prettier-ignore
export const MACHINE_TEMPLATES = {
  'chest-press': t('Chest press', 'machine', 'stack', W, ['chest'], ['triceps', 'front_delts'], 90, 5, ['seated chest press', 'machine chest press']),
  'pec-fly': t('Pec fly', 'machine', 'stack', W, ['chest'], ['front_delts'], 75, 3.5, ['pec deck', 'butterfly', 'chest fly', 'machine fly']),
  'rear-delt-fly': t('Rear delt fly', 'machine', 'stack', W, ['rear_delts'], ['upper_back'], 60, 3.5, ['reverse pec deck', 'reverse fly']),
  'shoulder-press': t('Shoulder press', 'machine', 'stack', W, ['front_delts'], ['triceps', 'side_delts'], 90, 5, ['overhead press machine', 'military press machine']),
  'lateral-raise': t('Lateral raise machine', 'machine', 'stack', W, ['side_delts'], [], 60, 3.5, ['delt raise', 'side raise']),
  'lat-pulldown': t('Lat pulldown', 'cable', null, W, ['lats'], ['biceps', 'upper_back'], 90, 4, ['pulldown', 'lat pull']),
  'seated-row': t('Seated row', 'machine', 'stack', W, ['lats', 'upper_back'], ['biceps', 'rear_delts'], 90, 4.5, ['row machine', 'mid row']),
  'pullover': t('Pullover machine', 'machine', 'stack', W, ['lats'], ['chest', 'triceps'], 75, 3.5, ['pullover']),
  'assisted-pull-up': t('Assisted pull-up', 'machine', 'stack', 'assisted', ['lats'], ['biceps', 'upper_back'], 90, 4, ['assisted chin-up', 'assisted dip', 'assist machine']),
  'biceps-curl': t('Biceps curl machine', 'machine', 'stack', W, ['biceps'], ['forearms'], 75, 3.5, ['arm curl', 'preacher curl machine']),
  'triceps-extension': t('Triceps extension machine', 'machine', 'stack', W, ['triceps'], [], 75, 3.5, ['arm extension', 'triceps machine']),
  'ab-crunch': t('Abdominal crunch', 'machine', 'stack', W, ['abs'], [], 60, 3.5, ['ab crunch', 'ab machine', 'crunch machine']),
  'back-extension': t('Back extension', 'machine', 'stack', W, ['lower_back'], ['glutes', 'hamstrings'], 75, 3.5, ['lower back machine', 'lumbar extension']),
  'leg-extension': t('Leg extension', 'machine', 'stack', W, ['quads'], [], 75, 3.5, ['quad extension']),
  'seated-leg-curl': t('Seated leg curl', 'machine', 'stack', W, ['hamstrings'], [], 75, 3.5, ['hamstring curl', 'leg curl']),
  'lying-leg-curl': t('Lying leg curl', 'machine', 'stack', W, ['hamstrings'], [], 75, 3.5, ['prone leg curl', 'hamstring curl', 'leg curl']),
  'leg-press': t('Leg press', 'machine', 'stack', W, ['quads'], ['glutes', 'hamstrings'], 120, 5, ['seated leg press']),
  'hip-adduction': t('Hip adduction', 'machine', 'stack', W, ['adductors'], [], 60, 3.5, ['inner thigh', 'adductor machine']),
  'hip-abduction': t('Hip abduction', 'machine', 'stack', W, ['abductors'], ['glutes'], 60, 3.5, ['outer thigh', 'abductor machine']),
  'glute-kickback': t('Glute kickback machine', 'machine', 'stack', W, ['glutes'], ['hamstrings'], 60, 3.5, ['glute machine', 'rear kick'], 1),
  'plate-chest-press': t('Plate-loaded chest press', 'machine', 'plate', W, ['chest'], ['triceps', 'front_delts'], 120, 5, ['plate chest press', 'unilateral chest press']),
  'plate-incline-press': t('Plate-loaded incline press', 'machine', 'plate', W, ['chest'], ['front_delts', 'triceps'], 120, 5, ['incline press', 'plate incline press']),
  'plate-decline-press': t('Plate-loaded decline press', 'machine', 'plate', W, ['chest'], ['triceps', 'front_delts'], 120, 5, ['decline press']),
  'plate-shoulder-press': t('Plate-loaded shoulder press', 'machine', 'plate', W, ['front_delts'], ['triceps', 'side_delts'], 120, 5, ['plate shoulder press']),
  'plate-high-row': t('Plate-loaded high row', 'machine', 'plate', W, ['lats'], ['upper_back', 'biceps'], 90, 4.5, ['high row']),
  'plate-low-row': t('Plate-loaded low row', 'machine', 'plate', W, ['lats', 'upper_back'], ['biceps', 'rear_delts'], 90, 4.5, ['low row', 'unilateral row']),
  'plate-pulldown': t('Plate-loaded pulldown', 'machine', 'plate', W, ['lats'], ['biceps', 'upper_back'], 90, 4.5, ['front pulldown', 'plate pulldown']),
  't-bar-row': t('Chest-supported T-bar row', 'machine', 'plate', W, ['lats', 'upper_back'], ['biceps', 'rear_delts'], 120, 5, ['t bar row', 'tbar row']),
  'plate-leg-press': t('45-degree leg press', 'machine', 'plate', W, ['quads'], ['glutes', 'hamstrings'], 150, 5, ['plate leg press', 'incline leg press']),
  'hack-squat': t('Hack squat', 'machine', 'plate', W, ['quads'], ['glutes'], 150, 5, ['hack squat machine']),
  'pendulum-squat': t('Pendulum squat', 'machine', 'plate', W, ['quads'], ['glutes'], 150, 5, ['pendulum']),
  'belt-squat': t('Belt squat', 'machine', 'plate', W, ['quads'], ['glutes', 'adductors'], 150, 5, ['belt squat machine']),
  'hip-thrust': t('Hip thrust machine', 'machine', 'plate', W, ['glutes'], ['hamstrings'], 90, 5, ['glute bridge machine']),
  'plate-seated-calf': t('Seated calf raise', 'machine', 'plate', W, ['calves'], [], 60, 3.5, ['calf machine']),
  'kneeling-leg-curl': t('Kneeling leg curl', 'machine', 'plate', W, ['hamstrings'], [], 60, 3.5, ['single leg curl'], 1),
  'ghd': t('Glute-ham developer', 'bodyweight', null, 'bodyweight_reps', ['hamstrings'], ['glutes', 'lower_back'], 90, 4, ['ghd', 'glute ham raise']),
  'reverse-hyper': t('Reverse hyperextension', 'machine', 'plate', W, ['lower_back'], ['glutes', 'hamstrings'], 90, 3.5, ['reverse hyper']),
  'treadmill': t('Treadmill', 'cardio_machine', null, 'distance_duration', ['cardio'], [], null, 8, ['running machine']),
  'upright-bike': t('Upright bike', 'cardio_machine', null, 'distance_duration', ['cardio'], [], null, 7, ['exercise bike', 'stationary bike']),
  'recumbent-bike': t('Recumbent bike', 'cardio_machine', null, 'distance_duration', ['cardio'], [], null, 5.5, ['exercise bike', 'stationary bike']),
  'elliptical': t('Elliptical', 'cardio_machine', null, 'duration', ['cardio'], [], null, 5, ['cross trainer']),
  'stair-climber': t('Stair climber', 'cardio_machine', null, 'duration', ['cardio'], [], null, 9, ['stair machine', 'step machine']),
  'rowing-machine': t('Rowing machine', 'cardio_machine', null, 'distance_duration', ['cardio'], [], null, 7, ['rower', 'erg', 'rowing ergometer']),
  'air-bike': t('Air bike', 'cardio_machine', null, 'duration', ['cardio'], [], null, 8, ['fan bike']),
} satisfies Record<string, MachineTemplate>;

export type TemplateKey = keyof typeof MACHINE_TEMPLATES;

// prettier-ignore
export const BRAND_LINEUPS: Record<MachineBrand, readonly TemplateKey[]> = {
  'Life Fitness': ['chest-press', 'shoulder-press', 'pec-fly', 'rear-delt-fly', 'lat-pulldown', 'seated-row', 'assisted-pull-up', 'biceps-curl', 'triceps-extension', 'ab-crunch', 'leg-extension', 'seated-leg-curl', 'leg-press', 'hip-adduction', 'hip-abduction', 'treadmill', 'upright-bike', 'elliptical'],
  'Hammer Strength': ['plate-chest-press', 'plate-incline-press', 'plate-decline-press', 'plate-shoulder-press', 'plate-high-row', 'plate-low-row', 'plate-pulldown', 't-bar-row', 'plate-leg-press', 'hack-squat', 'belt-squat', 'hip-thrust', 'plate-seated-calf', 'kneeling-leg-curl'],
  'Technogym': ['chest-press', 'shoulder-press', 'pec-fly', 'lat-pulldown', 'seated-row', 'biceps-curl', 'triceps-extension', 'ab-crunch', 'back-extension', 'leg-extension', 'seated-leg-curl', 'leg-press', 'hip-adduction', 'hip-abduction', 'treadmill', 'upright-bike', 'rowing-machine'],
  'Precor': ['chest-press', 'shoulder-press', 'pec-fly', 'lat-pulldown', 'seated-row', 'leg-extension', 'seated-leg-curl', 'treadmill', 'elliptical', 'recumbent-bike'],
  'Cybex': ['chest-press', 'shoulder-press', 'lateral-raise', 'lat-pulldown', 'seated-row', 'biceps-curl', 'triceps-extension', 'leg-extension', 'seated-leg-curl', 'leg-press', 'treadmill'],
  'Matrix': ['chest-press', 'shoulder-press', 'pec-fly', 'lat-pulldown', 'seated-row', 'assisted-pull-up', 'ab-crunch', 'leg-extension', 'seated-leg-curl', 'hip-adduction', 'hip-abduction', 'treadmill', 'stair-climber'],
  'Nautilus': ['chest-press', 'shoulder-press', 'lateral-raise', 'pullover', 'lat-pulldown', 'seated-row', 'biceps-curl', 'triceps-extension', 'leg-extension', 'lying-leg-curl'],
  'Rogue': ['belt-squat', 'ghd', 'reverse-hyper', 'air-bike', 'lat-pulldown'],
  'Gym80': ['plate-chest-press', 'plate-incline-press', 'plate-shoulder-press', 'plate-high-row', 'plate-low-row', 'plate-pulldown', 'plate-leg-press', 'hack-squat', 'leg-extension', 'lying-leg-curl'],
  'Panatta': ['plate-chest-press', 'plate-incline-press', 'plate-shoulder-press', 'plate-high-row', 'plate-low-row', 't-bar-row', 'hack-squat', 'pendulum-squat', 'hip-thrust', 'lateral-raise'],
  'Prime': ['plate-chest-press', 'plate-low-row', 'plate-pulldown', 'hack-squat', 'leg-extension', 'seated-leg-curl'],
  'Atlantis': ['plate-chest-press', 'plate-shoulder-press', 'plate-low-row', 'plate-leg-press', 'hack-squat', 'belt-squat', 'glute-kickback'],
};

/** "Hammer Strength" -> "hammer-strength", "Gym80" -> "gym80". */
export function brandSlug(brand: string): string {
  return brand
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const MACHINE_SEED_EXERCISES: readonly SeedExercise[] = COMMON_MACHINE_BRANDS.flatMap((brand) =>
  BRAND_LINEUPS[brand].map((key): SeedExercise => {
    const tpl: MachineTemplate = MACHINE_TEMPLATES[key];
    const group = MUSCLE_REGION[tpl.primary[0]];
    if (!group) throw new Error(`Machine template ${key} has no region`);
    return {
      id: `${brandSlug(brand)}-${key}`,
      name: tpl.name,
      group,
      log_type: tpl.log_type,
      primary_muscles: tpl.primary,
      secondary_muscles: tpl.secondary,
      equipment: tpl.equipment,
      per_side: tpl.per_side,
      default_rest_seconds: tpl.rest,
      met: tpl.met,
      brand,
      load_type: tpl.load_type,
    };
  })
);

/** Search aliases by machine id. Not stored in SQLite, so changing them needs no migration. */
export const SEED_ALIASES: ReadonlyMap<string, readonly string[]> = new Map(
  COMMON_MACHINE_BRANDS.flatMap((brand) =>
    BRAND_LINEUPS[brand].map((key): [string, readonly string[]] => [
      `${brandSlug(brand)}-${key}`,
      MACHINE_TEMPLATES[key].aliases,
    ])
  )
);

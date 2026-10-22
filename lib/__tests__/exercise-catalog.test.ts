import {
  exerciseDisplayName,
  exerciseSubtitle,
  filterExercises,
  splitSections,
  isRepLogType,
  MUSCLE_GROUPS,
  MUSCLE_LABELS,
  MUSCLE_REGION,
  REGIONS,
  EQUIPMENT_OPTIONS,
} from '@/lib/workouts/exercise-catalog';
import { workoutDisplayName } from '@/lib/workouts/format';
import type { Exercise } from '@/lib/types';

function ex(over: Partial<Exercise> & { id: string; name: string }): Exercise {
  return {
    log_type: 'weight_reps',
    primary_muscles: ['chest'],
    secondary_muscles: [],
    equipment: 'barbell',
    brand: null,
    load_type: null,
    base_weight_kg: null,
    per_side: 0,
    setup_notes: null,
    default_rest_seconds: null,
    met: null,
    source: 'seed',
    hidden: 0,
    created_at: 'x',
    updated_at: 'x',
    synced_at: null,
    deleted_at: null,
    ...over,
  } as Exercise;
}
const names = (l: Exercise[]) => l.map((e) => e.name);

describe('filterExercises', () => {
  it('ranks exact, then prefix, then word prefix, then substring, then alphabetical', () => {
    const list = [
      ex({ id: '1', name: 'Incurl press' }), // substring of "curl"
      ex({ id: '2', name: 'Zottman curl' }), // word prefix
      ex({ id: '3', name: 'Curl bar' }), // prefix
      ex({ id: '4', name: 'Curl' }), // exact
      ex({ id: '5', name: 'Curl alpha' }), // prefix, alphabetically before "Curl bar"
    ];
    expect(names(filterExercises(list, { query: 'curl' }))).toEqual([
      'Curl',
      'Curl alpha',
      'Curl bar',
      'Zottman curl',
      'Incurl press',
    ]);
  });

  it('requires every query token to match (AND)', () => {
    const list = [ex({ id: '1', name: 'Incline dumbbell press' }), ex({ id: '2', name: 'Incline barbell press' })];
    expect(names(filterExercises(list, { query: 'incline dumb' }))).toEqual(['Incline dumbbell press']);
    expect(filterExercises(list, { query: 'incline cable' })).toEqual([]);
  });

  it('matches the brand, ranked after name matches', () => {
    const list = [
      ex({ id: '1', name: 'Chest press', brand: 'Hammer Strength', source: 'custom' }),
      ex({ id: '2', name: 'Hammer curl' }),
    ];
    expect(names(filterExercises(list, { query: 'hammer' }))).toEqual(['Hammer curl', 'Chest press']);
    expect(names(filterExercises(list, { query: 'chest strength' }))).toEqual(['Chest press']);
  });

  it('filters by the region of the first primary muscle', () => {
    const list = [
      ex({ id: '1', name: 'A', primary_muscles: ['chest'] }),
      ex({ id: '2', name: 'B', primary_muscles: ['lats'], secondary_muscles: ['chest'] }),
      ex({ id: '3', name: 'C', primary_muscles: ['full_body'] }),
      ex({ id: '4', name: 'D', primary_muscles: ['upper_back'] }),
      ex({ id: '5', name: 'E', primary_muscles: ['lower_back'] }),
      ex({ id: '6', name: 'F', primary_muscles: ['abductors'] }),
      ex({ id: '7', name: 'G', primary_muscles: ['adductors'] }),
    ];
    expect(names(filterExercises(list, { region: 'Chest' }))).toEqual(['A']);
    expect(names(filterExercises(list, { region: 'Lats' }))).toEqual(['B']);
    expect(names(filterExercises(list, { region: 'Traps' }))).toEqual(['D']);
    expect(names(filterExercises(list, { region: 'Erectors' }))).toEqual(['E']);
    expect(names(filterExercises(list, { region: 'Glutes' }))).toEqual(['F']);
    expect(names(filterExercises(list, { region: 'Adductors' }))).toEqual(['G']);
    expect(names(filterExercises(list, { region: 'All' }))).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  });

  it('excludes hidden and deleted exercises', () => {
    const list = [
      ex({ id: '1', name: 'Hid', hidden: 1 }),
      ex({ id: '2', name: 'Del', deleted_at: 'x' }),
      ex({ id: '3', name: 'Ok' }),
    ];
    expect(names(filterExercises(list))).toEqual(['Ok']);
  });

  it('sorts alphabetically with no query', () => {
    const list = [ex({ id: '1', name: 'b' }), ex({ id: '2', name: 'A' })];
    expect(names(filterExercises(list))).toEqual(['A', 'b']);
  });
});

describe('display strings', () => {
  it('exerciseDisplayName joins name and brand, ignoring blank brands', () => {
    expect(exerciseDisplayName({ name: 'Chest press', brand: 'Hammer Strength' })).toBe('Chest press · Hammer Strength');
    expect(exerciseDisplayName({ name: 'Chest press', brand: '  ' })).toBe('Chest press');
    expect(exerciseDisplayName({ name: 'Chest press', brand: null })).toBe('Chest press');
  });

  it('exerciseSubtitle shows up to two muscles, per side and notes', () => {
    expect(
      exerciseSubtitle({
        primary_muscles: ['chest'],
        secondary_muscles: ['triceps', 'front_delts'],
        per_side: 0,
        setup_notes: null,
      })
    ).toBe('Chest, triceps');
    expect(
      exerciseSubtitle({ primary_muscles: ['lats'], secondary_muscles: [], per_side: 1, setup_notes: 'Seat 4' })
    ).toBe('Lats · per side · Seat 4');
    expect(
      exerciseSubtitle({ primary_muscles: [], secondary_muscles: [], per_side: 0, setup_notes: null })
    ).toBe('');
  });

  it('splitSections puts custom exercises first', () => {
    const a = ex({ id: '1', name: 'a', source: 'custom' });
    const b = ex({ id: '2', name: 'b' });
    expect(splitSections([b, a])).toEqual({ yours: [a], all: [b] });
  });

  it('isRepLogType is true only for rep-based types', () => {
    expect(['weight_reps', 'bodyweight_reps', 'assisted'].every((t) => isRepLogType(t as any))).toBe(true);
    expect(isRepLogType('duration')).toBe(false);
    expect(isRepLogType('distance_duration')).toBe(false);
    expect(EQUIPMENT_OPTIONS).toHaveLength(7);
  });

  it('has the agreed regions, muscle labels and region map', () => {
    expect(REGIONS).toEqual([
      'All', 'Chest', 'Shoulders', 'Triceps', 'Biceps', 'Forearms', 'Lats', 'Traps', 'Erectors',
      'Abdominals', 'Glutes', 'Quads', 'Hamstrings', 'Adductors', 'Calves', 'Cardio',
    ]);
    expect(MUSCLE_GROUPS).toHaveLength(19);
    for (const m of MUSCLE_GROUPS) {
      expect(MUSCLE_LABELS[m]).toBeTruthy();
      expect(m in MUSCLE_REGION).toBe(true);
    }
    expect(MUSCLE_GROUPS.filter((m) => MUSCLE_REGION[m] === null)).toEqual(['full_body']);
    expect(MUSCLE_LABELS.upper_back).toBe('Traps');
    expect(MUSCLE_LABELS.lower_back).toBe('Erectors');
    expect(MUSCLE_LABELS.abs).toBe('Abdominals');
    expect(MUSCLE_LABELS.abductors).toBe('Abductors');
    expect(MUSCLE_LABELS.adductors).toBe('Adductors');
    expect(MUSCLE_REGION.abductors).toBe('Glutes');
  });
});

describe('workoutDisplayName', () => {
  it('uses the name when set', () => {
    expect(workoutDisplayName({ name: ' Push day ', date: '2026-10-14' })).toBe('Push day');
  });
  it('falls back to a dated label when blank or null', () => {
    expect(workoutDisplayName({ name: null, date: '2026-10-14' })).toBe('Workout · Wed 14 Oct');
    expect(workoutDisplayName({ name: '   ', date: '2026-10-14' })).toBe('Workout · Wed 14 Oct');
  });
});

describe('filterExercises machine aliases and brands', () => {
  const aliases = new Map<string, readonly string[]>([
    ['hs-chest', ['plate chest press']],
    ['lf-fly', ['pec deck']],
    ['hs-fly', ['pec deck']],
    ['hs-curl', ['arm curl']],
  ]);
  const list = [
    ex({ id: 'hs-chest', name: 'Plate-loaded chest press', brand: 'Hammer Strength', equipment: 'machine' }),
    ex({ id: 'hs-fly', name: 'Pec fly', brand: 'Hammer Strength', equipment: 'machine' }),
    ex({ id: 'lf-fly', name: 'Pec fly', brand: 'Life Fitness', equipment: 'machine' }),
    ex({ id: 'hs-curl', name: 'Biceps curl machine', brand: 'Hammer Strength', primary_muscles: ['biceps'] }),
    ex({ id: 'hammer-curl', name: 'Hammer curl', primary_muscles: ['biceps'] }),
    ex({ id: 'deck-thing', name: 'Pec deck row' }),
    ex({ id: 'custom-fly', name: 'Cable fly', brand: ' life fitness ', source: 'custom' }),
  ];

  it('matches aliases only when passed, ranked above substring matches', () => {
    expect(filterExercises(list, { query: 'pec deck' }).map((e) => e.id)).toEqual(['deck-thing']);
    const r = filterExercises(list, { query: 'pec deck', aliases }).map((e) => e.id);
    expect(r).toEqual(['hs-fly', 'lf-fly', 'deck-thing']);
  });

  it('splits tokens across name, brand and alias', () => {
    expect(filterExercises(list, { query: 'hammer strength chest', aliases }).map((e) => e.id)).toEqual(['hs-chest']);
    expect(filterExercises(list, { query: 'pec deck life', aliases }).map((e) => e.id)).toEqual(['lf-fly']);
  });

  it('puts a name prefix above brand-only matches', () => {
    const r = filterExercises(list, { query: 'hammer', aliases }).map((e) => e.id);
    expect(r[0]).toBe('hammer-curl');
    expect(r.slice(1)).toEqual(['hs-curl', 'hs-fly', 'hs-chest']);
  });

  it('filters by brand case-insensitively, including custom rows', () => {
    const ids = (f: object) => filterExercises(list, { aliases, ...f }).map((e) => e.id);
    expect(ids({ brand: '  LIFE fitness ' })).toEqual(['custom-fly', 'lf-fly']);
    expect(ids({ brand: null })).toHaveLength(list.length);
    expect(ids({ brand: 'Hammer Strength', region: 'Biceps' })).toEqual(['hs-curl']);
    expect(ids({ brand: 'Hammer Strength', query: 'fly' })).toEqual(['hs-fly']);
  });

  it('excludes hidden and deleted machines even when an alias matches', () => {
    const l = [
      ex({ id: 'hs-fly', name: 'Pec fly', hidden: 1 }),
      ex({ id: 'lf-fly', name: 'Pec fly', deleted_at: 'x' }),
    ];
    expect(filterExercises(l, { query: 'pec deck', aliases })).toEqual([]);
  });
});

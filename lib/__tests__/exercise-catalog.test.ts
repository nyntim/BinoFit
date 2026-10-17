import {
  exerciseDisplayName,
  exerciseSubtitle,
  filterExercises,
  splitSections,
  isRepLogType,
  MUSCLE_GROUPS,
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
    ];
    expect(names(filterExercises(list, { region: 'Chest' }))).toEqual(['A']);
    expect(names(filterExercises(list, { region: 'Back' }))).toEqual(['B']);
    expect(names(filterExercises(list, { region: 'All' }))).toEqual(['A', 'B', 'C']);
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
    expect(MUSCLE_GROUPS).toHaveLength(17);
    expect(EQUIPMENT_OPTIONS).toHaveLength(7);
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

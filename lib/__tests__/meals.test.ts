import {
  buildDraft,
  deleteMealMessage,
  draftErrors,
  formatMealTargets,
  isDraftDirty,
  mealSummary,
  mealsForDay,
  moveItem,
  nameForDate,
  newMealName,
  parseTarget,
  validateMealName,
  MEAL_LIMITS,
  DEFAULT_MEALS,
} from '@/lib/meals';
import type { MealDefinition, MealNameEntry } from '@/lib/types';

const def = (id: string, position: number, over: Partial<MealDefinition> = {}): MealDefinition => ({
  id,
  position,
  calorie_target: null,
  protein_target: null,
  carb_target: null,
  fat_target: null,
  created_at: '',
  updated_at: '',
  ...over,
});

const entry = (meal_id: string, name: string, effective_from: string): MealNameEntry => ({
  meal_id,
  name,
  effective_from,
  updated_at: '',
});

describe('validateMealName', () => {
  it('accepts a normal name', () => {
    expect(validateMealName('Brunch', ['Lunch'])).toBeNull();
  });
  it('rejects empty and whitespace-only names', () => {
    expect(validateMealName('', [])).not.toBeNull();
    expect(validateMealName('   ', [])).not.toBeNull();
  });
  it('limits to 24 characters after trimming', () => {
    expect(validateMealName(' ' + 'a'.repeat(24) + ' ', [])).toBeNull();
    expect(validateMealName('a'.repeat(25), [])).not.toBeNull();
  });
  it('rejects duplicates case-insensitively', () => {
    expect(validateMealName(' lunch ', ['Lunch'])).not.toBeNull();
  });
});

describe('validateMealName edge cases', () => {
  it('allows a meal to keep its own name (others exclude itself)', () => {
    expect(validateMealName('Lunch', ['Dinner'])).toBeNull();
  });
  it('exposes limits of 1 to 8 meals and 24 character names', () => {
    expect(MEAL_LIMITS).toEqual({ min: 1, max: 8, nameMax: 24 });
  });
  it('defaults map to the legacy slot ids', () => {
    expect(DEFAULT_MEALS.map((m) => m.id)).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
  });
});

describe('nameForDate history', () => {
  it('keeps the old name for yesterday when renamed effective today', () => {
    const names = [entry('a', 'Old', '0000-01-01'), entry('a', 'New', '2026-06-01')];
    expect(nameForDate(names, 'a', '2026-05-31')).toBe('Old');
    expect(nameForDate(names, 'a', '2026-06-01')).toBe('New');
  });
  it('is independent of entry order', () => {
    const names = [entry('a', 'New', '2026-06-01'), entry('a', 'Old', '0000-01-01')];
    expect(nameForDate(names, 'a', '2026-05-31')).toBe('Old');
  });
  it('ignores other meals entries', () => {
    const names = [entry('a', 'A', '0000-01-01'), entry('b', 'B', '2026-01-01')];
    expect(nameForDate(names, 'a', '2026-06-01')).toBe('A');
  });
});

describe('mealsForDay extras', () => {
  const defs = [def('a', 0), def('b', 1)];
  const names = [entry('a', 'A', '0000-01-01'), entry('b', 'B', '0000-01-01')];
  it('includes meals that have no logs', () => {
    const r = mealsForDay(defs, names, [{ meal_slot: 'a' }], '2026-01-01');
    expect(r.map((m) => m.id)).toEqual(['a', 'b']);
    expect(r[1].def).not.toBeNull();
  });
  it('creates one Other group per distinct orphan id, after active meals', () => {
    const logs = [{ meal_slot: 'x' }, { meal_slot: 'a' }, { meal_slot: 'y' }, { meal_slot: 'x' }];
    const r = mealsForDay(defs, names, logs, '2026-01-01');
    expect(r.map((m) => [m.id, m.orphan, m.def === null])).toEqual([
      ['a', false, false],
      ['b', false, false],
      ['x', true, true],
      ['y', true, true],
    ]);
    expect(r.filter((m) => m.orphan).every((m) => m.name === 'Other')).toBe(true);
  });
});

describe('nameForDate', () => {
  const names = [entry('a', 'Old', '0000-01-01'), entry('a', 'New', '2026-03-10')];
  it('uses the latest entry effective on or before the date', () => {
    expect(nameForDate(names, 'a', '2026-03-09')).toBe('Old');
    expect(nameForDate(names, 'a', '2026-03-10')).toBe('New');
    expect(nameForDate(names, 'a', '2030-01-01')).toBe('New');
  });
  it('uses the earliest name for dates before the first entry', () => {
    expect(nameForDate([entry('b', 'Brunch', '2026-05-01')], 'b', '2026-01-01')).toBe('Brunch');
  });
  it('falls back to "Meal" for unknown meals', () => {
    expect(nameForDate(names, 'zzz', '2026-03-10')).toBe('Meal');
  });
});

describe('mealsForDay', () => {
  const defs = [def('b', 1), def('a', 0)];
  const names = [entry('a', 'A', '0000-01-01'), entry('b', 'B', '0000-01-01')];
  it('orders active meals by position', () => {
    expect(mealsForDay(defs, names, [], '2026-01-01').map((m) => m.id)).toEqual(['a', 'b']);
  });
  it('adds an "Other" group for logs of unknown meals, once per id', () => {
    const logs = [{ meal_slot: 'a' }, { meal_slot: 'gone' }, { meal_slot: 'gone' }];
    const result = mealsForDay(defs, names, logs, '2026-01-01');
    expect(result.map((m) => [m.id, m.name, m.orphan])).toEqual([
      ['a', 'A', false],
      ['b', 'B', false],
      ['gone', 'Other', true],
    ]);
  });
});

describe('moveItem', () => {
  it('moves forward and backward', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });
  it('clamps the target and ignores bad sources', () => {
    expect(moveItem(['a', 'b'], 0, 9)).toEqual(['b', 'a']);
    const same = ['a', 'b'];
    expect(moveItem(same, 5, 0)).toBe(same);
  });
});

describe('draft helpers', () => {
  const defs = [def('a', 0), def('b', 1)];
  const names = [entry('a', 'A', '0000-01-01'), entry('b', 'B', '0000-01-01')];

  it('builds from today names and is not dirty until changed', () => {
    const initial = buildDraft(defs, names, '2026-06-01');
    expect(initial.meals.map((m) => m.name)).toEqual(['A', 'B']);
    expect(isDraftDirty(initial, buildDraft(defs, names, '2026-06-01'))).toBe(false);
    const renamed = { ...initial, meals: [{ ...initial.meals[0], name: 'X' }, initial.meals[1]] };
    expect(isDraftDirty(initial, renamed)).toBe(true);
    expect(isDraftDirty(initial, { ...initial, deletedIds: ['b'] })).toBe(true);
  });

  it('reports duplicate and empty names per meal', () => {
    const d = buildDraft(defs, names, '2026-06-01');
    d.meals[1].name = 'a';
    expect(draftErrors(d).a).not.toBeNull();
    expect(draftErrors(d).b).not.toBeNull();
    d.meals[1].name = 'B';
    expect(draftErrors(d)).toEqual({ a: null, b: null });
  });

  it('picks a unique default name for a new meal', () => {
    expect(newMealName(['A'])).toBe('New meal');
    expect(newMealName(['New meal', 'new meal 2'])).toBe('New meal 3');
  });
});

describe('targets formatting', () => {
  const totals = { calories: 319.6, protein: 12.34, carbs: 30, fat: 8 };
  it('formats calories against the target', () => {
    expect(formatMealTargets(def('a', 0, { calorie_target: 500 }), totals)).toEqual({
      calories: '320 / 500 cal',
      macros: null,
    });
  });
  it('formats only the macros that have targets', () => {
    const r = formatMealTargets(def('a', 0, { protein_target: 40, fat_target: 20 }), totals);
    expect(r.calories).toBeNull();
    expect(r.macros).toBe('Protein 12.3 / 40 g · Fat 8 / 20 g');
  });
  it('returns nothing without targets', () => {
    expect(formatMealTargets(null, totals)).toEqual({ calories: null, macros: null });
  });
  it('parses target text', () => {
    expect(parseTarget('')).toBeNull();
    expect(parseTarget(' 12.5 ')).toBe(12.5);
    expect(parseTarget('abc')).toBeUndefined();
    expect(parseTarget('-1')).toBeUndefined();
  });
});

describe('copy', () => {
  it('summarises a meal', () => {
    expect(mealSummary(0, 0)).toBe('No food');
    expect(mealSummary(1, 99.6)).toBe('1 item · 100 cal');
    expect(mealSummary(3, 540)).toBe('3 items · 540 cal');
  });
  it('words the delete confirmation with the food count', () => {
    expect(deleteMealMessage('Snacks', 42)).toBe("Delete Snacks and 42 logged foods? This can't be undone.");
    expect(deleteMealMessage('Snacks', 1)).toBe("Delete Snacks and 1 logged food? This can't be undone.");
    expect(deleteMealMessage('Snacks', 0)).toBe("Delete Snacks? This can't be undone.");
  });
});

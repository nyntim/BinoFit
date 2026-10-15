import type { NutritionTotals } from '@/lib/nutrition-totals';
import type { MealDefinition, MealId, MealNameEntry, MealTargets } from '@/lib/types';

/** Seeded once on first launch. Their ids match the legacy fixed meal_slot values. */
export const DEFAULT_MEALS: { id: MealId; name: string }[] = [
  { id: 'breakfast', name: 'Breakfast' },
  { id: 'lunch', name: 'Lunch' },
  { id: 'dinner', name: 'Dinner' },
  { id: 'snack', name: 'Snacks' },
];

export const MEAL_LIMITS = { min: 1, max: 8, nameMax: 24 } as const;

/** effective_from for names that apply to all history. */
export const ALWAYS_EFFECTIVE = '0000-01-01';

export const FALLBACK_MEAL_NAME = 'Meal';
export const ORPHAN_MEAL_NAME = 'Other';

/** Returns an error message, or null when the name is acceptable. `others` are the other meals' names. */
export function validateMealName(name: string, others: string[]): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Enter a name';
  if (trimmed.length > MEAL_LIMITS.nameMax) return `Use ${MEAL_LIMITS.nameMax} characters or fewer`;
  const lower = trimmed.toLowerCase();
  if (others.some((o) => o.trim().toLowerCase() === lower)) return 'Another meal has this name';
  return null;
}

/**
 * The name a meal had on `date`: latest entry with effective_from <= date. A date before the
 * meal's first entry uses its earliest name. Unknown meals fall back to "Meal".
 */
export function nameForDate(names: MealNameEntry[], mealId: MealId, date: string): string {
  const entries = names.filter((n) => n.meal_id === mealId);
  if (entries.length === 0) return FALLBACK_MEAL_NAME;
  const sorted = [...entries].sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  let result = sorted[0].name;
  for (const e of sorted) {
    if (e.effective_from <= date) result = e.name;
  }
  return result;
}

export type DayMeal = {
  id: MealId;
  name: string;
  def: MealDefinition | null;
  /** True for a group of logs whose meal no longer exists. */
  orphan: boolean;
};

/**
 * Meals to show for a date, in order: every active meal, then one "Other" group per meal id
 * found in `logs` that has no definition, so totals never include invisible food.
 */
export function mealsForDay(
  defs: MealDefinition[],
  names: MealNameEntry[],
  logs: { meal_slot: MealId }[],
  date: string
): DayMeal[] {
  const active: DayMeal[] = [...defs]
    .sort((a, b) => a.position - b.position)
    .map((def) => ({ id: def.id, name: nameForDate(names, def.id, date), def, orphan: false }));
  const known = new Set(defs.map((d) => d.id));
  const orphanIds: MealId[] = [];
  for (const l of logs) {
    if (!known.has(l.meal_slot) && !orphanIds.includes(l.meal_slot)) orphanIds.push(l.meal_slot);
  }
  return [
    ...active,
    ...orphanIds.map((id) => ({ id, name: ORPHAN_MEAL_NAME, def: null, orphan: true })),
  ];
}

/** Moves the item at `from` to `to`. Returns a new array. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const target = Math.max(0, Math.min(list.length - 1, to));
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}

/** Positions 0..n-1 in list order. */
export function withPositions<T extends { id: MealId }>(list: T[]): (T & { position: number })[] {
  return list.map((item, position) => ({ ...item, position }));
}

// ── Draft (edit mode) ───────────────────────────────────────────

export type DraftMeal = MealTargets & {
  id: MealId;
  /** 'HH:mm' (24h) or null for no reminder. */
  reminder_time: string | null;
  name: string;
  isNew: boolean;
};

export type MealDraft = {
  /** Active meals in display order. */
  meals: DraftMeal[];
  /** Ids of existing meals to delete (and all their food) on save. */
  deletedIds: MealId[];
};

export const NO_TARGETS: MealTargets = {
  calorie_target: null,
  protein_target: null,
  carb_target: null,
  fat_target: null,
};

export function buildDraft(
  defs: MealDefinition[],
  names: MealNameEntry[],
  today: string
): MealDraft {
  const meals = [...defs]
    .sort((a, b) => a.position - b.position)
    .map<DraftMeal>((d) => ({
      id: d.id,
      name: nameForDate(names, d.id, today),
      isNew: false,
      calorie_target: d.calorie_target,
      protein_target: d.protein_target,
      carb_target: d.carb_target,
      fat_target: d.fat_target,
      reminder_time: d.reminder_time ?? null,
    }));
  return { meals, deletedIds: [] };
}

export function isDraftDirty(initial: MealDraft, draft: MealDraft): boolean {
  if (draft.deletedIds.length > 0) return true;
  if (initial.meals.length !== draft.meals.length) return true;
  return draft.meals.some((m, i) => {
    const a = initial.meals[i];
    return (
      m.id !== a.id ||
      m.name.trim() !== a.name ||
      m.calorie_target !== a.calorie_target ||
      m.protein_target !== a.protein_target ||
      m.carb_target !== a.carb_target ||
      m.fat_target !== a.fat_target ||
      m.reminder_time !== a.reminder_time
    );
  });
}

/** Per-meal name error (null when valid), keyed by meal id. */
export function draftErrors(draft: MealDraft): Record<MealId, string | null> {
  const result: Record<MealId, string | null> = {};
  for (const m of draft.meals) {
    const others = draft.meals.filter((o) => o.id !== m.id).map((o) => o.name);
    result[m.id] = validateMealName(m.name, others);
  }
  return result;
}

export function draftHasErrors(draft: MealDraft): boolean {
  return Object.values(draftErrors(draft)).some((e) => e !== null);
}

/** A default name for a new meal that does not clash with `existing`. */
export function newMealName(existing: string[]): string {
  const lower = new Set(existing.map((n) => n.trim().toLowerCase()));
  let name = 'New meal';
  for (let i = 2; lower.has(name.toLowerCase()); i++) name = `New meal ${i}`;
  return name;
}

/** Formats a Date as 'HH:mm' (24h, local). */
export function toReminderTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Parses 'HH:mm' into hour and minute, or null when malformed. */
export function parseReminderTime(
  time: string | null | undefined
): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time ?? '');
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

/** Display text for a reminder time in the device's 12/24h style, e.g. "12:30 PM". */
export function formatReminderTime(time: string): string {
  const p = parseReminderTime(time);
  if (!p) return time;
  return new Date(2000, 0, 1, p.hour, p.minute).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Parses a target field: '' -> null; negative or non-numeric -> undefined (invalid). */
export function parseTarget(text: string): number | null | undefined {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export function hasAnyTarget(t: MealTargets | null | undefined): boolean {
  return !!t && (t.calorie_target != null || t.protein_target != null || t.carb_target != null || t.fat_target != null);
}

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Header text for a meal with targets: calories as "320 / 500 cal" (null when no calorie
 * target) and macros as "Protein 12 / 40 g · Carbs 30 / 60 g" (null when none are set).
 */
export function formatMealTargets(
  targets: MealTargets | null | undefined,
  totals: NutritionTotals
): { calories: string | null; macros: string | null } {
  if (!targets) return { calories: null, macros: null };
  const calories =
    targets.calorie_target != null
      ? `${r0(totals.calories)} / ${r0(targets.calorie_target)} cal`
      : null;
  const parts: string[] = [];
  if (targets.protein_target != null) parts.push(`Protein ${r1(totals.protein)} / ${r1(targets.protein_target)} g`);
  if (targets.carb_target != null) parts.push(`Carbs ${r1(totals.carbs)} / ${r1(targets.carb_target)} g`);
  if (targets.fat_target != null) parts.push(`Fat ${r1(totals.fat)} / ${r1(targets.fat_target)} g`);
  return { calories, macros: parts.length > 0 ? parts.join(' · ') : null };
}

/** "3 items · 540 cal", or "No food". */
export function mealSummary(count: number, calories: number): string {
  if (count === 0) return 'No food';
  return `${count} ${count === 1 ? 'item' : 'items'} · ${Math.round(calories)} cal`;
}

/** Alert body for deleting a meal and its food. */
export function deleteMealMessage(name: string, foodCount: number): string {
  const what =
    foodCount > 0 ? `${name} and ${foodCount} logged ${foodCount === 1 ? 'food' : 'foods'}` : name;
  return `Delete ${what}? This can't be undone.`;
}

// Pure draft model for food search multi-select. Nothing here touches storage; the store in
// food-selection-store.ts wraps it and nothing is persisted until the review screen confirms.
import {
  convertServingAmount,
  formatServingAmount,
  validateServing,
  validBaseGrams,
  type ServingUnit,
  type ServingValidation,
} from '@/lib/food-validation';
import { parseBaseGrams } from '@/lib/serving-units';
import type { Food } from '@/lib/types';

export type SelectionContext = { meal_slot: string; date: string };
export type ResolveStatus = 'pending' | 'ready' | 'failed';

export type SelectionItem = {
  food: Food;
  /** Raw text as typed, in `unit`. */
  amount: string;
  unit: ServingUnit;
  status: ResolveStatus;
  /** Bumped by markResolving so a late result from an older attempt is ignored. */
  token: number;
};

export type SelectionState = {
  context: SelectionContext;
  order: string[];
  items: Record<string, SelectionItem>;
};

export type BatchLogItem = { food_id: string; serving_amount: number; serving_unit: string };

const round1 = (v: number) => Math.round(v * 10) / 10;

export function emptySelection(context: SelectionContext): SelectionState {
  return { context, order: [], items: {} };
}

export function isSelected(state: SelectionState, id: string): boolean {
  return id in state.items;
}

export function selectedCount(state: SelectionState): number {
  return state.order.length;
}

/** Adds the food, or removes it when already selected (keyed by food id, so sections share state). */
export function toggleFood(state: SelectionState, food: Food, initialAmount?: number | null): SelectionState {
  if (isSelected(state, food.id)) return removeFood(state, food.id);
  const amount = initialAmount && Number.isFinite(initialAmount) && initialAmount > 0 ? formatServingAmount(initialAmount) : '1';
  const item: SelectionItem = { food, amount, unit: 'default', status: 'pending', token: 1 };
  return { ...state, order: [...state.order, food.id], items: { ...state.items, [food.id]: item } };
}

export function removeFood(state: SelectionState, id: string): SelectionState {
  if (!isSelected(state, id)) return state;
  const items = { ...state.items };
  delete items[id];
  return { ...state, order: state.order.filter((x) => x !== id), items };
}

export function clearSelection(state: SelectionState): SelectionState {
  return emptySelection(state.context);
}

function patchItem(state: SelectionState, id: string, patch: Partial<SelectionItem>): SelectionState {
  const item = state.items[id];
  if (!item) return state;
  return { ...state, items: { ...state.items, [id]: { ...item, ...patch } } };
}

export function setItemAmount(state: SelectionState, id: string, raw: string): SelectionState {
  return patchItem(state, id, { amount: raw });
}

export function baseGramsOf(food: Food): number | null {
  const parsed = parseBaseGrams(food.serving_units);
  return validBaseGrams(parsed) ? parsed : null;
}

/** Converts the amount to the new unit; foods without base grams stay on the default unit. */
export function setItemUnit(state: SelectionState, id: string, unit: ServingUnit): SelectionState {
  const item = state.items[id];
  if (!item || item.unit === unit) return state;
  const baseGrams = baseGramsOf(item.food);
  if (!baseGrams) return state;
  const converted = convertServingAmount(item.amount, item.unit, unit, baseGrams);
  return patchItem(state, id, { unit, amount: converted ?? item.amount });
}

export function markResolving(state: SelectionState, id: string): SelectionState {
  const item = state.items[id];
  return item ? patchItem(state, id, { status: 'pending', token: item.token + 1 }) : state;
}

/** Applies a resolve result; ignored when the item is gone or the token is stale. Amount and unit are kept. */
export function applyResolved(state: SelectionState, id: string, token: number, food: Food | null): SelectionState {
  const item = state.items[id];
  if (!item || item.token !== token) return state;
  return patchItem(state, id, food ? { food, status: 'ready' } : { status: 'failed' });
}

export function itemValidation(item: SelectionItem): ServingValidation {
  return validateServing(item.amount, item.unit, baseGramsOf(item.food));
}

export type ItemTotals = { calories: number; protein: number; carbs: number; fat: number };
const ZERO: ItemTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

export function itemTotals(item: SelectionItem): ItemTotals {
  const v = itemValidation(item);
  if (!v.valid || v.multiplier === null) return ZERO;
  const m = v.multiplier;
  return {
    calories: Math.round(item.food.calories * m),
    protein: round1(item.food.protein * m),
    carbs: round1(item.food.carbs * m),
    fat: round1(item.food.fat * m),
  };
}

export function batchTotals(state: SelectionState): ItemTotals {
  const sum = state.order.reduce(
    (acc, id) => {
      const t = itemTotals(state.items[id]);
      return { calories: acc.calories + t.calories, protein: acc.protein + t.protein, carbs: acc.carbs + t.carbs, fat: acc.fat + t.fat };
    },
    ZERO
  );
  return { calories: sum.calories, protein: round1(sum.protein), carbs: round1(sum.carbs), fat: round1(sum.fat) };
}

export function canConfirm(state: SelectionState): boolean {
  return state.order.length > 0 && state.order.every((id) => {
    const item = state.items[id];
    return item.status === 'ready' && itemValidation(item).valid;
  });
}

/** Rows for addFoodLogsBatch: the multiplier is stored in serving_amount, like the single flow. */
export function buildBatchItems(state: SelectionState): BatchLogItem[] {
  if (!canConfirm(state)) throw new Error('Selection is not ready to confirm');
  return state.order.map((id) => {
    const item = state.items[id];
    return { food_id: item.food.id, serving_amount: itemValidation(item).multiplier!, serving_unit: item.food.serving_units };
  });
}

// Module-level pub/sub store for the food search multi-select draft (pattern of
// workouts/active-workout-store.ts). In memory only: nothing is persisted until commit.
import { addFoodLogsBatch } from '@/lib/database';
import { resolveLoggableFood } from '@/lib/food-resolve';
import {
  applyResolved,
  buildBatchItems,
  clearSelection,
  emptySelection,
  markResolving,
  removeFood,
  setItemAmount,
  setItemUnit,
  toggleFood,
  type SelectionContext,
  type SelectionState,
} from '@/lib/food-selection';
import { getDefaultLogStatus } from '@/lib/storage';
import type { ServingUnit } from '@/lib/food-validation';
import type { Food } from '@/lib/types';

let state: SelectionState = emptySelection({ meal_slot: '', date: '' });
const listeners = new Set<() => void>();
let inFlight: Promise<'saved'> | null = null;

function set(next: SelectionState): void {
  state = next;
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      // A throwing listener must not break others.
    }
  });
}

export function getFoodSelection(): SelectionState {
  return state;
}

export function subscribeFoodSelection(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Starts a fresh draft for the meal and date; always resets. */
export function beginFoodSelection(context: SelectionContext): void {
  set(emptySelection(context));
}

/** Drops the draft (screen unmount). */
export function endFoodSelection(): void {
  set(emptySelection({ meal_slot: '', date: '' }));
}

export async function resolveSelectedFood(id: string): Promise<void> {
  const item = state.items[id];
  if (!item) return;
  set(markResolving(state, id));
  const token = state.items[id].token;
  const resolved = await resolveLoggableFood(item.food);
  set(applyResolved(state, id, token, resolved));
}

export function resolvePendingFoods(): void {
  state.order.forEach((id) => {
    if (state.items[id]?.status === 'failed') void resolveSelectedFood(id);
  });
}

export function toggleSelectedFood(food: Food, initialAmount?: number | null): void {
  const wasSelected = food.id in state.items;
  set(toggleFood(state, food, initialAmount));
  if (!wasSelected) void resolveSelectedFood(food.id);
}

export function removeSelectedFood(id: string): void {
  set(removeFood(state, id));
}

export function clearSelectedFoods(): void {
  set(clearSelection(state));
}

export function setSelectedAmount(id: string, raw: string): void {
  set(setItemAmount(state, id, raw));
}

export function setSelectedUnit(id: string, unit: ServingUnit): void {
  set(setItemUnit(state, id, unit));
}

function nowHHmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Writes every selected food in one transaction. A second call while one runs returns the same
 * promise (no double insert). The draft is cleared only after the transaction resolves; on a
 * throw it is untouched and the error propagates.
 */
export function commitFoodSelection(): Promise<'saved'> {
  if (inFlight) return inFlight;
  const snapshot = state;
  inFlight = (async () => {
    const items = buildBatchItems(snapshot);
    const status = await getDefaultLogStatus();
    await addFoodLogsBatch({
      date: snapshot.context.date,
      meal_slot: snapshot.context.meal_slot,
      logged_time: nowHHmm(),
      items,
      defaultEaten: status === 'eaten',
    });
    set(clearSelection(state));
    return 'saved' as const;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

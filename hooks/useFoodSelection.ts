import { useSyncExternalStore } from 'react';
import { getFoodSelection, subscribeFoodSelection } from '@/lib/food-selection-store';
import type { SelectionState } from '@/lib/food-selection';

/** The food search multi-select draft; re-renders on change. */
export function useFoodSelection(): SelectionState {
  return useSyncExternalStore(subscribeFoodSelection, getFoodSelection, getFoodSelection);
}

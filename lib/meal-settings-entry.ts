import type { MealDefinition, MealNameEntry } from '@/lib/types';

type MealSnapshot = { defs: MealDefinition[]; names: MealNameEntry[] };

/** Opens the meal editor from the rows returned by this request's own reload. */
export async function openMealEditAfterReload(
  reload: () => Promise<MealSnapshot>,
  isEditing: () => boolean,
  start: (snapshot: MealSnapshot) => void,
): Promise<void> {
  if (isEditing()) return;
  const snapshot = await reload();
  if (!isEditing()) start(snapshot);
}

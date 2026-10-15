import { useCallback, useMemo, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { saveMealDraft } from '@/lib/database';
import {
  MEAL_LIMITS,
  NO_TARGETS,
  buildDraft,
  draftErrors,
  isDraftDirty,
  moveItem,
  newMealName,
} from '@/lib/meals';
import type { MealDraft } from '@/lib/meals';
import type { MealDefinition, MealId, MealNameEntry, MealTargets } from '@/lib/types';

/**
 * The edit-mode draft of the meal list. Nothing is written until save(); cancel() discards.
 * `draft` is null when not editing.
 */
export function useMealDraft() {
  const [draft, setDraft] = useState<MealDraft | null>(null);
  const [initial, setInitial] = useState<MealDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const start = useCallback((defs: MealDefinition[], names: MealNameEntry[], today: string) => {
    const d = buildDraft(defs, names, today);
    setInitial(d);
    setDraft(d);
  }, []);

  const cancel = useCallback(() => {
    setInitial(null);
    setDraft(null);
  }, []);

  const update = (fn: (d: MealDraft) => MealDraft) => setDraft((d) => (d ? fn(d) : d));

  const rename = (id: MealId, name: string) =>
    update((d) => ({ ...d, meals: d.meals.map((m) => (m.id === id ? { ...m, name } : m)) }));

  const setTargets = (id: MealId, targets: MealTargets) =>
    update((d) => ({ ...d, meals: d.meals.map((m) => (m.id === id ? { ...m, ...targets } : m)) }));

  const add = () =>
    update((d) => {
      if (d.meals.length >= MEAL_LIMITS.max) return d;
      return {
        ...d,
        meals: [
          ...d.meals,
          {
            id: Crypto.randomUUID(),
            name: newMealName(d.meals.map((m) => m.name)),
            isNew: true,
            ...NO_TARGETS,
          },
        ],
      };
    });

  /** Marks a meal for deletion on save. A meal added in this draft is simply dropped. */
  const remove = (id: MealId) =>
    update((d) => {
      if (d.meals.length <= MEAL_LIMITS.min) return d;
      const target = d.meals.find((m) => m.id === id);
      if (!target) return d;
      return {
        meals: d.meals.filter((m) => m.id !== id),
        deletedIds: target.isNew ? d.deletedIds : [...d.deletedIds, id],
      };
    });

  const reorder = (orderedIds: MealId[]) =>
    update((d) => {
      const byId = new Map(d.meals.map((m) => [m.id, m]));
      const next = orderedIds.map((id) => byId.get(id)).filter((m) => !!m);
      return next.length === d.meals.length ? { ...d, meals: next as typeof d.meals } : d;
    });

  const moveBy = (id: MealId, delta: number) =>
    update((d) => {
      const from = d.meals.findIndex((m) => m.id === id);
      return { ...d, meals: moveItem(d.meals, from, from + delta) };
    });

  const errors = useMemo(() => (draft ? draftErrors(draft) : {}), [draft]);
  const hasErrors = Object.values(errors).some((e) => e !== null);
  const dirty = !!draft && !!initial && isDraftDirty(initial, draft);

  /** Writes the draft in one transaction. Resolves true on success. */
  const save = useCallback(
    async (today: string): Promise<boolean> => {
      if (!draft || hasErrors || savingRef.current) return false;
      savingRef.current = true;
      setSaving(true);
      try {
        await saveMealDraft(draft, today);
        setInitial(null);
        setDraft(null);
        return true;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [draft, hasErrors]
  );

  return {
    draft,
    errors,
    hasErrors,
    dirty,
    saving,
    start,
    cancel,
    save,
    rename,
    setTargets,
    add,
    remove,
    reorder,
    moveBy,
  };
}

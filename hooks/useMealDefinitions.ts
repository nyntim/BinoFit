import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { format } from 'date-fns';
import { getMealDefinitions, getMealNames } from '@/lib/database';
import { nameForDate } from '@/lib/meals';
import type { MealDefinition, MealId, MealNameEntry } from '@/lib/types';

/** Meal definitions and name history, reloaded whenever the screen gains focus. */
export function useMealDefinitions() {
  const [defs, setDefs] = useState<MealDefinition[]>([]);
  const [names, setNames] = useState<MealNameEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [d, n] = await Promise.all([getMealDefinitions(), getMealNames()]);
      setDefs(d);
      setNames(n);
      return { defs: d, names: n };
    } finally {
      // Stop waiting even on failure; logs then show under "Other" instead of an endless spinner
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload().catch((e) => console.error('Failed to load meals:', e));
    }, [reload])
  );

  /** The name a meal had on `date` (defaults to today). */
  const labelFor = useCallback(
    (id: MealId | undefined, date?: string) =>
      nameForDate(names, id ?? '', date ?? format(new Date(), 'yyyy-MM-dd')),
    [names]
  );

  return { defs, names, loaded, reload, labelFor };
}

import { useEffect, useState } from 'react';
import { usePreferences } from '@/hooks/usePreferences';
import { getMealSlotConfirmationsByDate } from '@/lib/database';
import { newFoodStatus } from '@/lib/nutrition-totals';
import type { LogStatus, MealSlot, MealSlotConfirmation } from '@/lib/types';

type Loaded = { date: string; rows: MealSlotConfirmation[] };

/** The status food logged to this meal on this date will get, or null until known (or if the read fails). */
export function useNewFoodStatus(date: string | undefined, slot: MealSlot | undefined): LogStatus | null {
  const { defaultLogStatus, loaded: preferencesLoaded } = usePreferences();
  const [state, setState] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    getMealSlotConfirmationsByDate(date).then(
      (rows) => { if (!cancelled) setState({ date, rows }); },
      () => { if (!cancelled) setState(null); }
    );
    return () => { cancelled = true; };
  }, [date]);

  if (!slot || !preferencesLoaded || !state || state.date !== date) return null;
  return newFoodStatus(state.rows, slot, defaultLogStatus);
}

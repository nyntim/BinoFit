import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { usePreferences } from '@/hooks/usePreferences';
import { getFoodLogsWithFoodByDate, getMealSlotConfirmationsByDate } from '@/lib/database';
import { sumEatenTotals } from '@/lib/nutrition-totals';
import { getDoneWorkoutsBetween } from '@/lib/workouts/history';
import { summarizeWorkout } from '@/lib/workouts/summary';
import type { WorkoutSummary } from '@/lib/types';

type State = { date: string; eatenCalories: number | null; workouts: WorkoutSummary[]; foodPending: boolean; workoutPending: boolean };

/**
 * Eaten calories and completed workouts for one day (calendar summary, day detail).
 * The food and workout reads fail independently: a failed food read gives null calories, a failed
 * workout read gives an empty list. Future days skip the workout read. A null date does nothing.
 */
export function useDaySummary(date: string | null): { eatenCalories: number | null; workouts: WorkoutSummary[]; loading: boolean } {
  const { weightUnit } = usePreferences();
  const [state, setState] = useState<State | null>(null);
  const request = useRef(0);

  useEffect(() => {
    if (!date) return;
    const generation = request;
    const id = ++generation.current;
    const current = () => id === request.current;
    const today = format(new Date(), 'yyyy-MM-dd');
    const skipWorkouts = date > today;
    setState({ date, eatenCalories: null, workouts: [], foodPending: true, workoutPending: !skipWorkouts });

    Promise.all([getFoodLogsWithFoodByDate(date), getMealSlotConfirmationsByDate(date)]).then(
      ([logs, confirmations]) => {
        if (current()) setState((prev) => prev && { ...prev, eatenCalories: Math.round(sumEatenTotals(logs, confirmations).calories), foodPending: false });
      },
      () => { if (current()) setState((prev) => prev && { ...prev, eatenCalories: null, foodPending: false }); }
    );
    if (!skipWorkouts) {
      getDoneWorkoutsBetween(date, date).then(
        (rows) => { if (current()) setState((prev) => prev && { ...prev, workouts: rows.map((w) => summarizeWorkout(w, weightUnit)), workoutPending: false }); },
        () => { if (current()) setState((prev) => prev && { ...prev, workouts: [], workoutPending: false }); }
      );
    }
    return () => { generation.current++; };
  }, [date, weightUnit]);

  if (!date || !state || state.date !== date) return { eatenCalories: null, workouts: [], loading: !!date };
  return { eatenCalories: state.eatenCalories, workouts: state.workouts, loading: state.foodPending || state.workoutPending };
}

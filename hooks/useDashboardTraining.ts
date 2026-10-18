import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useIsFocused } from 'expo-router';
import { format } from 'date-fns';
import { useActiveWorkout } from '@/hooks/useActiveWorkout';
import { useNow } from '@/hooks/useNow';
import { usePreferences } from '@/hooks/usePreferences';
import { getDoneWorkoutDates, getDoneWorkoutsBetween } from '@/lib/workouts/history';
import { summarizeWorkout } from '@/lib/workouts/summary';
import type { WorkoutSummary } from '@/lib/types';

type DatesState = { today: string; dates: string[]; loading: boolean; error: boolean };
type DayState = { date: string; rows: WorkoutSummary[]; loading: boolean; error: boolean };

/** Local completed-workout signals for Nutrition. Calendar dates and day detail fail independently. */
export function useDashboardTraining(selectedDate: string) {
  const focused = useIsFocused();
  const now = useNow(60_000, focused);
  const today = format(new Date(now), 'yyyy-MM-dd');
  const { weightUnit } = usePreferences();
  const { workout: active } = useActiveWorkout();
  const activeId = active?.id ?? null;
  const [datesState, setDatesState] = useState<DatesState>({ today, dates: [], loading: true, error: false });
  const [dayState, setDayState] = useState<DayState>({ date: selectedDate, rows: [], loading: true, error: false });
  const datesRequest = useRef(0);
  const dayRequest = useRef(0);

  const reload = useCallback(() => {
    const datesId = ++datesRequest.current;
    const dayId = ++dayRequest.current;
    setDatesState({ today, dates: [], loading: true, error: false });
    setDayState({ date: selectedDate, rows: [], loading: selectedDate <= today, error: false });
    getDoneWorkoutDates(today).then(
      (dates) => { if (datesId === datesRequest.current) setDatesState({ today, dates, loading: false, error: false }); },
      () => { if (datesId === datesRequest.current) setDatesState({ today, dates: [], loading: false, error: true }); }
    );
    if (selectedDate > today) return;
    getDoneWorkoutsBetween(selectedDate, selectedDate).then(
      (workouts) => {
        if (dayId === dayRequest.current) setDayState({ date: selectedDate, rows: workouts.map((w) => summarizeWorkout(w, weightUnit)), loading: false, error: false });
      },
      () => { if (dayId === dayRequest.current) setDayState({ date: selectedDate, rows: [], loading: false, error: true }); }
    );
  }, [selectedDate, today, weightUnit, activeId]);

  useFocusEffect(useCallback(() => {
    reload();
    return () => { datesRequest.current++; dayRequest.current++; };
  }, [reload]));

  return {
    today,
    trainedDates: datesState.today === today ? datesState.dates : [],
    dayWorkouts: dayState.date === selectedDate && selectedDate <= today ? dayState.rows : [],
    datesLoading: datesState.loading,
    datesError: datesState.error,
    dayLoading: dayState.date !== selectedDate || dayState.loading,
    dayError: dayState.date === selectedDate && dayState.error,
    reload,
  };
}

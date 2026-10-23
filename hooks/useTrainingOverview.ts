import { getUserGoals } from '@/lib/storage';
import { volumeTargetProgress, type VolumeTargetProgress } from '@/lib/workouts/targets';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useIsFocused } from 'expo-router';
import { useActiveWorkout } from '@/hooks/useActiveWorkout';
import { useNow } from '@/hooks/useNow';
import { usePreferences } from '@/hooks/usePreferences';
import { getDoneWorkoutsBetween, getRecentDoneWorkouts } from '@/lib/workouts/history';
import {
  formatWeekRange,
  setsPerMuscle,
  summarizeWeek,
  summarizeWorkout,
  weekRange,
} from '@/lib/workouts/summary';
import type { WeekSummary, WorkoutSummary } from '@/lib/types';

export const RECENT_COUNT = 3;

export type TrainingOverview = {
  status: 'loading' | 'ready' | 'error';
  week: WeekSummary;
  weekLabel: string;
  muscleSets: VolumeTargetProgress[];
  recent: WorkoutSummary[];
  reload: () => void;
};

const EMPTY_WEEK: WeekSummary = { sessions: 0, volumeKg: 0, durationSeconds: 0 };

/** This week's totals and the latest finished workouts; reloads on focus and when the active workout changes. */
export function useTrainingOverview(): TrainingOverview {
  const { weightUnit } = usePreferences();
  const { workout: active } = useActiveWorkout();
  const [state, setState] = useState<Omit<TrainingOverview, 'reload'>>({
    status: 'loading',
    week: EMPTY_WEEK,
    weekLabel: formatWeekRange(weekRange(new Date())),
    muscleSets: [],
    recent: [],
  });
  const requestRef = useRef(0);

  const reload = useCallback(() => {
    const request = ++requestRef.current;
    const range = weekRange(new Date());
    Promise.all([getDoneWorkoutsBetween(range.start, range.end), getRecentDoneWorkouts(RECENT_COUNT), getUserGoals()])
      .then(([weekWorkouts, recent, goals]) => {
        if (request !== requestRef.current) return;
        setState({
          status: 'ready',
          week: summarizeWeek(weekWorkouts),
          weekLabel: formatWeekRange(range),
          muscleSets: volumeTargetProgress(setsPerMuscle(weekWorkouts), goals?.weekly_volume_targets),
          recent: recent.map((w) => summarizeWorkout(w, weightUnit)),
        });
      })
      .catch(() => {
        if (request !== requestRef.current) return;
        setState((s) => ({ ...s, status: s.status === 'ready' ? 'ready' : 'error' }));
      });
  }, [weightUnit]);

  useFocusEffect(reload);
  // Ticks while the tab is focused so the week rolls over at midnight on Sunday.
  const now = useNow(60_000, useIsFocused());
  // Reload when the active workout or the current week changes (not on mount: focus did that).
  const activeId = active?.id ?? null;
  const thisWeek = weekRange(new Date(now));
  const weekStart = thisWeek.start;
  const lastKey = useRef(`${activeId}|${weekStart}`);
  useEffect(() => {
    const key = `${activeId}|${weekStart}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    reload();
  }, [activeId, weekStart, reload]);

  return { ...state, weekLabel: formatWeekRange(thisWeek), reload };
}

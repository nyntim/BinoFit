import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { format } from 'date-fns';
import {
  getAllLoggedDates,
  getFoodLogsWithFoodInRange,
  getMealSlotConfirmationsInRange,
} from '@/lib/database';
import {
  bucket,
  bucketFor,
  buildDailyTotals,
  rangeBounds,
  summarize,
  type Bucket,
  type BucketUnit,
  type DailyTotal,
  type ProgressRange,
  type ProgressSummary,
} from '@/lib/progress';
import { computeStreaks, type Streaks } from '@/lib/streak';
import { getUserGoals } from '@/lib/storage';
import { getLiveWeightDays } from '@/lib/weight';
import { trendWeights, weeklyRate, type TrendPoint } from '@/lib/weight-trend';
import { getDoneWorkoutDates, getDoneWorkoutsBetween } from '@/lib/workouts/history';
import {
  recentRecords,
  trainingAverages,
  trainingBuckets,
  type RecentRecord,
  type TrainingAverages,
  type TrainingBucket,
} from '@/lib/workouts/progress';
import type { UserGoals, WeightEntry, WorkoutWithExercises } from '@/lib/types';

type Loaded = {
  range: ProgressRange;
  today: string;
  bounds: { start: string; end: string; days: number };
  daily: DailyTotal[];
  goals: UserGoals | null;
  loggedDates: string[];
  weightDays: WeightEntry[];
  trainedDates: string[];
  workouts: WorkoutWithExercises[];
  nothingEver: boolean;
};

export type ProgressData = {
  loading: boolean;
  /** Range the loaded data was built for; lags `range` while a reload runs. */
  loadedRange: ProgressRange | null;
  today: string;
  bounds: Loaded['bounds'];
  daily: DailyTotal[];
  summary: ProgressSummary;
  buckets: Bucket[];
  unit: BucketUnit;
  goals: UserGoals | null;
  loggedDates: string[];
  trend: TrendPoint[];
  weeklyRateKg: number | null;
  trainedDates: string[];
  trainingBounds: Loaded['bounds'];
  trainingUnit: BucketUnit;
  workoutBuckets: TrainingBucket[];
  workoutAverages: TrainingAverages | null;
  records: RecentRecord[];
  streaks: Streaks;
  nothingEver: boolean;
};

/** Trend data for the Progress tab; reloads on focus and when the range changes. */
export function useProgress(range: ProgressRange): ProgressData {
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      const request = ++requestRef.current;
      setLoading(true);
      (async () => {
        try {
          const today = format(new Date(), 'yyyy-MM-dd');
          const [loggedDates, goals] = await Promise.all([getAllLoggedDates(today), getUserGoals()]);
          const first = loggedDates.length > 0 ? loggedDates[loggedDates.length - 1] : null;
          const bounds = rangeBounds(range, today, first);
          const [logs, confirmations, weightDays] = await Promise.all([
            getFoodLogsWithFoodInRange(bounds.start, bounds.end),
            getMealSlotConfirmationsInRange(bounds.start, bounds.end),
            getLiveWeightDays(),
          ]);
          let trainedDates: string[] = [];
          let workouts: WorkoutWithExercises[] = [];
          try {
            trainedDates = await getDoneWorkoutDates(today);
            if (trainedDates.length > 0) {
              const firstWorkoutDate = trainedDates[trainedDates.length - 1];
              workouts = await getDoneWorkoutsBetween(firstWorkoutDate, today);
            }
          } catch {
            trainedDates = [];
            workouts = [];
          }
          if (request !== requestRef.current) return;
          setData({
            range,
            today,
            bounds,
            daily: buildDailyTotals(logs, confirmations, bounds.start, bounds.end),
            goals,
            loggedDates,
            weightDays,
            trainedDates,
            workouts,
            nothingEver: loggedDates.length === 0 && weightDays.length === 0 && trainedDates.length === 0,
          });
        } catch {
          if (request !== requestRef.current) return;
        } finally {
          if (request === requestRef.current) setLoading(false);
        }
      })();
    }, [range])
  );

  return useMemo(() => {
    const activeRange = data?.range ?? range;
    const today = data?.today ?? format(new Date(), 'yyyy-MM-dd');
    const bounds = data?.bounds ?? { start: today, end: today, days: 1 };
    const daily = data?.daily ?? [];
    const unit = bucketFor(activeRange, bounds.days);
    const trend = trendWeights(data?.weightDays ?? []);
    const weeklyRateKg = weeklyRate(trend, today);
    const trainedDates = data?.trainedDates ?? [];
    const allWorkouts = data?.workouts ?? [];
    const firstWorkoutDate = trainedDates.length > 0 ? trainedDates[trainedDates.length - 1] : null;
    const trainingBounds = rangeBounds(activeRange, today, firstWorkoutDate);
    const trainingUnit = bucketFor(activeRange, trainingBounds.days);
    const workoutsInRange = allWorkouts.filter(
      (w) => w.date >= trainingBounds.start && w.date <= trainingBounds.end
    );
    return {
      loading,
      loadedRange: data?.range ?? null,
      today,
      bounds,
      daily,
      summary: summarize(daily, today),
      buckets: bucket(daily, unit),
      unit,
      goals: data?.goals ?? null,
      loggedDates: data?.loggedDates ?? [],
      trend,
      weeklyRateKg,
      trainedDates,
      trainingBounds,
      trainingUnit,
      workoutBuckets: trainingBuckets(
        trainingBounds.start,
        trainingBounds.end,
        trainingUnit,
        workoutsInRange
      ),
      workoutAverages: trainingAverages(workoutsInRange, trainingBounds.days),
      records: recentRecords(allWorkouts, 5),
      streaks: computeStreaks(data?.loggedDates ?? [], today),
      nothingEver: data?.nothingEver ?? false,
    };
  }, [data, loading, range]);
}

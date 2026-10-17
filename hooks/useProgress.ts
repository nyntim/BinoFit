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
import { getLatestWeightEntry } from '@/lib/weight';
import type { UserGoals } from '@/lib/types';

type Loaded = {
  range: ProgressRange;
  today: string;
  bounds: { start: string; end: string; days: number };
  daily: DailyTotal[];
  goals: UserGoals | null;
  loggedDates: string[];
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
          const [logs, confirmations] = await Promise.all([
            getFoodLogsWithFoodInRange(bounds.start, bounds.end),
            getMealSlotConfirmationsInRange(bounds.start, bounds.end),
          ]);
          const weight = await getLatestWeightEntry();
          if (request !== requestRef.current) return;
          setData({
            range,
            today,
            bounds,
            daily: buildDailyTotals(logs, confirmations, bounds.start, bounds.end),
            goals,
            loggedDates,
            nothingEver: loggedDates.length === 0 && !weight,
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
    const today = data?.today ?? format(new Date(), 'yyyy-MM-dd');
    const bounds = data?.bounds ?? { start: today, end: today, days: 1 };
    const daily = data?.daily ?? [];
    const unit = bucketFor(data?.range ?? range, bounds.days);
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
      streaks: computeStreaks(data?.loggedDates ?? [], today),
      nothingEver: data?.nothingEver ?? false,
    };
  }, [data, loading, range]);
}

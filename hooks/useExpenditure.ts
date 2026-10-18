import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { format } from 'date-fns';
import {
  getFoodLogsWithFoodInRange,
  getMealSlotConfirmationsInRange,
} from '@/lib/database';
import {
  countWeighInsInWindow,
  estimateExpenditure,
  expenditureWindow,
  type ExpenditureEstimate,
} from '@/lib/expenditure';
import { buildDailyTotals } from '@/lib/progress';
import { getRecentWeightDays } from '@/lib/weight';
import { trendWeights, weeklyRate } from '@/lib/weight-trend';

export type ExpenditureState = {
  status: 'loading' | 'ready' | 'error';
  estimate: ExpenditureEstimate | null;
  rateKgPerWeek: number | null;
  reload: () => Promise<void>;
};

const WEIGHT_HISTORY_DAYS = 120;

/** Estimated daily expenditure over the last 21 days; reloads whenever the screen gains focus. */
export function useExpenditure(): ExpenditureState {
  const [status, setStatus] = useState<ExpenditureState['status']>('loading');
  const [estimate, setEstimate] = useState<ExpenditureEstimate | null>(null);
  const [rateKgPerWeek, setRateKgPerWeek] = useState<number | null>(null);
  const latestCall = useRef(0);

  const reload = useCallback(async () => {
    const call = ++latestCall.current;
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const { start, end } = expenditureWindow(today);
      const [logs, confirmations, weightDays] = await Promise.all([
        getFoodLogsWithFoodInRange(start, end),
        getMealSlotConfirmationsInRange(start, end),
        getRecentWeightDays(WEIGHT_HISTORY_DAYS),
      ]);
      if (call !== latestCall.current) return;

      const daily = buildDailyTotals(logs, confirmations, start, end);
      const pastWeightDays = weightDays.filter((e) => e.date < today);
      const trend = trendWeights(pastWeightDays);
      const rate = weeklyRate(trend, today);
      const weighIns = countWeighInsInWindow(pastWeightDays, start, end);
      const mappedTrend = trend.map((p) => ({ date: p.date, kg: p.trend_kg }));
      const nextEstimate = estimateExpenditure(daily, mappedTrend, weighIns, today);

      setEstimate(nextEstimate);
      setRateKgPerWeek(rate);
      setStatus('ready');
    } catch {
      if (call !== latestCall.current) return;
      setEstimate(null);
      setRateKgPerWeek(null);
      setStatus('error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  return { status, estimate, rateKgPerWeek, reload };
}

import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getRecentWeightDays } from '@/lib/weight';
import type { WeightEntry } from '@/lib/types';

export type WeightEntriesState = {
  /** Latest entry of each of the most recent days, newest first. */
  days: WeightEntry[];
  status: 'loading' | 'ready' | 'error';
  reload: () => Promise<void>;
};

/** Recent weight days; reloads whenever the screen gains focus. */
export function useWeightEntries(count = 5): WeightEntriesState {
  const [days, setDays] = useState<WeightEntry[]>([]);
  const [status, setStatus] = useState<WeightEntriesState['status']>('loading');
  const latestCall = useRef(0);

  const reload = useCallback(async () => {
    const call = ++latestCall.current;
    try {
      const rows = await getRecentWeightDays(count);
      if (call !== latestCall.current) return;
      setDays(rows);
      setStatus('ready');
    } catch {
      if (call !== latestCall.current) return;
      setStatus('error');
    }
  }, [count]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  return { days, status, reload };
}

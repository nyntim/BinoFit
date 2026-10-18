import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getLiveWeightDays } from '@/lib/weight';
import type { WeightEntry } from '@/lib/types';

export type WeightEntriesState = {
  /** Latest entry of each live day, newest first. */
  days: WeightEntry[];
  status: 'loading' | 'ready' | 'error';
  reload: () => Promise<void>;
};

/** Live weight days; reloads whenever the screen gains focus. */
export function useWeightEntries(): WeightEntriesState {
  const [days, setDays] = useState<WeightEntry[]>([]);
  const [status, setStatus] = useState<WeightEntriesState['status']>('loading');
  const latestCall = useRef(0);

  const reload = useCallback(async () => {
    const call = ++latestCall.current;
    try {
      const rows = await getLiveWeightDays();
      if (call !== latestCall.current) return;
      setDays(rows);
      setStatus('ready');
    } catch {
      if (call !== latestCall.current) return;
      setStatus('error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  return { days, status, reload };
}

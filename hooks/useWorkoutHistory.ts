import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { usePreferences } from '@/hooks/usePreferences';
import { getRecentDoneWorkouts } from '@/lib/workouts/history';
import { summarizeWorkout } from '@/lib/workouts/summary';
import type { WorkoutSummary } from '@/lib/types';

export const HISTORY_PAGE_SIZE = 30;

export type WorkoutHistory = {
  status: 'loading' | 'ready' | 'error';
  items: WorkoutSummary[];
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreFailed: boolean;
  loadMore: () => void;
  reload: () => void;
};

/** Finished workouts, newest first, 30 per page. Reloads the loaded pages on focus. */
export function useWorkoutHistory(): WorkoutHistory {
  const { weightUnit } = usePreferences();
  const [items, setItems] = useState<WorkoutSummary[]>([]);
  const [status, setStatus] = useState<WorkoutHistory['status']>('loading');
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const requestRef = useRef(0);
  const countRef = useRef(0);
  const busyRef = useRef(false);

  const reload = useCallback(() => {
    const request = ++requestRef.current;
    // A reload supersedes any in-flight page; let the next loadMore start fresh.
    busyRef.current = false;
    setLoadingMore(false);
    setLoadMoreFailed(false);
    const count = Math.max(HISTORY_PAGE_SIZE, countRef.current);
    getRecentDoneWorkouts(count, 0)
      .then((rows) => {
        if (request !== requestRef.current) return;
        countRef.current = rows.length;
        setItems(rows.map((w) => summarizeWorkout(w, weightUnit)));
        setHasMore(rows.length === count);
        setStatus('ready');
      })
      .catch(() => {
        if (request !== requestRef.current) return;
        setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
      });
  }, [weightUnit]);

  useFocusEffect(reload);

  const loadMore = useCallback(() => {
    if (busyRef.current || !hasMore || status !== 'ready') return;
    busyRef.current = true;
    setLoadingMore(true);
    setLoadMoreFailed(false);
    const request = requestRef.current;
    getRecentDoneWorkouts(HISTORY_PAGE_SIZE, countRef.current)
      .then((rows) => {
        if (request !== requestRef.current) return;
        countRef.current += rows.length;
        setItems((prev) => {
          const seen = new Set(prev.map((i) => i.id));
          return [...prev, ...rows.filter((w) => !seen.has(w.id)).map((w) => summarizeWorkout(w, weightUnit))];
        });
        setHasMore(rows.length === HISTORY_PAGE_SIZE);
      })
      .catch(() => {
        if (request === requestRef.current) setLoadMoreFailed(true);
      })
      .finally(() => {
        if (request !== requestRef.current) return; // reload already reset the flags
        busyRef.current = false;
        setLoadingMore(false);
      });
  }, [hasMore, status, weightUnit]);

  return { status, items, hasMore, loadingMore, loadMoreFailed, loadMore, reload };
}

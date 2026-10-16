import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { syncToSupabase } from '@/lib/sync';
import { isSyncConfigured, setOffline } from '@/lib/sync-status';
import { useSyncStatus } from '@/hooks/useSyncStatus';

/** Delay before each automatic retry while sync is failing: 30s, 1m, 2m, then 5m. */
export const RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 300_000];

/**
 * Keeps the offline flag current, syncs when connectivity returns, and retries
 * with backoff while the app is active and the last sync failed. Mount once at the root.
 */
export function useSyncAutoRetry(): void {
  const { state } = useSyncStatus();
  const { status, failureCount } = state;
  const attempt = useRef(0);
  const wasOnline = useRef<boolean | null>(null);
  const [active, setActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => {
      const online = Boolean(s.isConnected) && s.isInternetReachable !== false;
      setOffline(s.isConnected === false || s.isInternetReachable === false);
      if (online && wasOnline.current === false) {
        syncToSupabase();
      }
      wasOnline.current = online;
    });
    return unsub;
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      setActive(next === 'active');
    });
    setActive(AppState.currentState === 'active');
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (status === 'success') attempt.current = 0;
    if (status !== 'failed' || !active || !isSyncConfigured()) return;
    const delay = RETRY_DELAYS_MS[Math.min(attempt.current, RETRY_DELAYS_MS.length - 1)];
    const t = setTimeout(() => {
      attempt.current += 1;
      syncToSupabase();
    }, delay);
    return () => clearTimeout(t);
  }, [status, failureCount, active]);
}

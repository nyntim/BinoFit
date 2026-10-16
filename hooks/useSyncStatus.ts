import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  SYNC_GRACE_MS,
  getSyncState,
  subscribeSyncState,
  type SyncState,
} from '@/lib/sync-status';

/** Current sync state; re-renders when the store changes and when the grace period ends. */
export function useSyncStatus(): { state: SyncState; now: number } {
  const state = useSyncExternalStore(subscribeSyncState, getSyncState, getSyncState);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    if (state.failingSince === null) return;
    const remaining = state.failingSince + SYNC_GRACE_MS - Date.now();
    if (remaining <= 0) return;
    const t = setTimeout(() => setNow(Date.now()), remaining + 50);
    return () => clearTimeout(t);
  }, [state.failingSince]);

  return { state, now };
}

// Tiny pub/sub store describing the health of the Supabase sync.
// Kept free of imports from lib/sync.ts so both sides can use it without a cycle.

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'failed';

export type SyncState = {
  status: SyncStatus;
  /** Epoch ms of the last fully successful pass in this session (null until one completes). */
  lastSuccessAt: number | null;
  /** Epoch ms of the first failure in the current run of failures (null when not failing). */
  failingSince: number | null;
  /** Last connectivity reading from NetInfo. Unknown is treated as online. */
  isOffline: boolean;
  /** Increments on every failed result, so each failure can re-arm the retry timer. */
  failureCount: number;
};

/** A failure must last this long before the indicator appears. */
export const SYNC_GRACE_MS = 30_000;

const INITIAL: SyncState = {
  status: 'idle',
  lastSuccessAt: null,
  failingSince: null,
  isOffline: false,
  failureCount: 0,
};

let state: SyncState = INITIAL;
const listeners = new Set<() => void>();

function set(patch: Partial<SyncState>): void {
  const next = { ...state, ...patch };
  if (
    next.status === state.status &&
    next.lastSuccessAt === state.lastSuccessAt &&
    next.failingSince === state.failingSince &&
    next.isOffline === state.isOffline &&
    next.failureCount === state.failureCount
  ) {
    return;
  }
  state = next;
  notify();
}

function notify(): void {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      // A throwing listener must not break sync or other listeners.
    }
  });
}

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSyncState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function reportSyncStart(): void {
  set({ status: 'syncing' });
}

export function reportSyncResult(ok: boolean, now: number = Date.now()): void {
  if (ok) {
    set({ status: 'success', lastSuccessAt: now, failingSince: null });
  } else {
    set({
      status: 'failed',
      failingSince: state.failingSince ?? now,
      failureCount: state.failureCount + 1,
    });
  }
}

export function setOffline(offline: boolean): void {
  set({ isOffline: offline });
}

/** Test helper. */
export function resetSyncState(): void {
  state = INITIAL;
  notify();
}

/** Sync needs Supabase config; without it the app is local-only. */
export function isSyncConfigured(): boolean {
  return Boolean(
    process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  );
}

export type IndicatorState =
  | { visible: false }
  | { visible: true; label: string };

/** Whether the failure has outlasted the grace period (also true while a retry is in flight). */
export function isPaused(s: SyncState, now: number, configured: boolean): boolean {
  if (!configured) return false;
  if (s.failingSince === null) return false;
  return now - s.failingSince >= SYNC_GRACE_MS;
}

export function deriveIndicator(s: SyncState, now: number, configured: boolean): IndicatorState {
  if (!isPaused(s, now, configured)) return { visible: false };
  return { visible: true, label: s.isOffline ? 'Sync paused · offline' : 'Sync paused' };
}

export type LastSyncedState =
  | { kind: 'off' }
  | { kind: 'paused' }
  | { kind: 'never' }
  | { kind: 'at'; at: number };

/** Settings row. `persistedAt` is the last success stored across launches. */
export function deriveLastSynced(
  s: SyncState,
  now: number,
  configured: boolean,
  persistedAt: number | null
): LastSyncedState {
  if (!configured) return { kind: 'off' };
  if (isPaused(s, now, configured)) return { kind: 'paused' };
  const at = s.lastSuccessAt ?? persistedAt;
  return at === null ? { kind: 'never' } : { kind: 'at', at };
}

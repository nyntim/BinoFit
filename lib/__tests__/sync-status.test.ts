import {
  SYNC_GRACE_MS,
  deriveIndicator,
  deriveLastSynced,
  getSyncState,
  reportSyncResult,
  reportSyncStart,
  resetSyncState,
  setOffline,
  subscribeSyncState,
} from '@/lib/sync-status';

const T0 = 1_000_000;

beforeEach(() => resetSyncState());

describe('deriveIndicator', () => {
  it('is hidden before the grace period and visible at exactly 30s', () => {
    reportSyncResult(false, T0);
    expect(deriveIndicator(getSyncState(), T0 + SYNC_GRACE_MS - 1, true)).toEqual({ visible: false });
    expect(deriveIndicator(getSyncState(), T0 + SYNC_GRACE_MS, true).visible).toBe(true);
  });

  it('is hidden when there has been no failure', () => {
    reportSyncResult(true, T0);
    expect(deriveIndicator(getSyncState(), T0 + 10 * SYNC_GRACE_MS, true)).toEqual({ visible: false });
  });

  it('a success clears the failure and the next failure restarts the grace period', () => {
    reportSyncResult(false, T0);
    reportSyncResult(true, T0 + 40_000);
    expect(deriveIndicator(getSyncState(), T0 + 41_000, true).visible).toBe(false);
    reportSyncResult(false, T0 + 50_000);
    expect(deriveIndicator(getSyncState(), T0 + 50_000 + SYNC_GRACE_MS - 1, true).visible).toBe(false);
    expect(deriveIndicator(getSyncState(), T0 + 50_000 + SYNC_GRACE_MS, true).visible).toBe(true);
  });

  it('repeated failures keep the original failingSince', () => {
    reportSyncResult(false, T0);
    reportSyncResult(false, T0 + 20_000);
    expect(getSyncState().failingSince).toBe(T0);
  });

  it('stays visible while a retry is in flight', () => {
    reportSyncResult(false, T0);
    reportSyncStart();
    expect(deriveIndicator(getSyncState(), T0 + SYNC_GRACE_MS, true).visible).toBe(true);
  });

  it('is always hidden when sync is not configured', () => {
    reportSyncResult(false, T0);
    expect(deriveIndicator(getSyncState(), T0 + 10 * SYNC_GRACE_MS, false)).toEqual({ visible: false });
  });

  it('uses offline copy when offline and generic copy otherwise', () => {
    reportSyncResult(false, T0);
    const now = T0 + SYNC_GRACE_MS;
    expect(deriveIndicator(getSyncState(), now, true)).toEqual({ visible: true, label: 'Sync paused' });
    setOffline(true);
    expect(deriveIndicator(getSyncState(), now, true)).toEqual({ visible: true, label: 'Sync paused · offline' });
  });
});

describe('deriveLastSynced', () => {
  it('is off when not configured', () => {
    expect(deriveLastSynced(getSyncState(), T0, false, 5)).toEqual({ kind: 'off' });
  });

  it('is never when nothing has synced and nothing is persisted', () => {
    expect(deriveLastSynced(getSyncState(), T0, true, null)).toEqual({ kind: 'never' });
  });

  it('falls back to the persisted timestamp', () => {
    expect(deriveLastSynced(getSyncState(), T0, true, 123)).toEqual({ kind: 'at', at: 123 });
  });

  it('prefers the in-session success over the persisted timestamp', () => {
    reportSyncResult(true, 999);
    expect(deriveLastSynced(getSyncState(), T0, true, 123)).toEqual({ kind: 'at', at: 999 });
  });

  it('is paused once the failure outlasts the grace period, even with a persisted timestamp', () => {
    reportSyncResult(false, T0);
    expect(deriveLastSynced(getSyncState(), T0 + 1, true, 123)).toEqual({ kind: 'at', at: 123 });
    expect(deriveLastSynced(getSyncState(), T0 + SYNC_GRACE_MS, true, 123)).toEqual({ kind: 'paused' });
  });
});

describe('store', () => {
  it('notifies subscribers on change only and stops after unsubscribe', () => {
    const l = jest.fn();
    const unsub = subscribeSyncState(l);
    setOffline(true);
    setOffline(true);
    expect(l).toHaveBeenCalledTimes(1);
    unsub();
    setOffline(false);
    expect(l).toHaveBeenCalledTimes(1);
  });
});

import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { RETRY_DELAYS_MS, useSyncAutoRetry } from '@/hooks/useSyncAutoRetry';
import { getSyncState, reportSyncResult, reportSyncStart, resetSyncState } from '@/lib/sync-status';
import { syncToSupabase } from '@/lib/sync';

jest.mock('@/lib/sync', () => ({ syncToSupabase: jest.fn() }));

const addListener = NetInfo.addEventListener as jest.Mock;
let emit: (s: { isConnected: boolean | null; isInternetReachable: boolean | null }) => Promise<void>;
let unsubscribe: jest.Mock;
const sync = syncToSupabase as jest.Mock;

const ENV = { url: process.env.EXPO_PUBLIC_SUPABASE_URL, key: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY };

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.restoreAllMocks();
  // Jest's AppState has no native initial state; the app starts active.
  AppState.currentState = 'active';
  resetSyncState();
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'key';
  unsubscribe = jest.fn();
  addListener.mockImplementation((cb) => {
    emit = (s) => act(async () => cb(s));
    return unsubscribe;
  });
});

afterEach(() => {
  jest.useRealTimers();
  process.env.EXPO_PUBLIC_SUPABASE_URL = ENV.url;
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = ENV.key;
  if (ENV.url === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (ENV.key === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
});

const online = { isConnected: true, isInternetReachable: true };
const offline = { isConnected: false, isInternetReachable: false };

describe('useSyncAutoRetry connectivity', () => {
  it('offline to online triggers exactly one sync', async () => {
    await renderHook(() => useSyncAutoRetry());
    await emit(offline);
    expect(sync).not.toHaveBeenCalled();
    await emit(online);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('online to online does not sync', async () => {
    await renderHook(() => useSyncAutoRetry());
    await emit(online);
    await emit(online);
    expect(sync).not.toHaveBeenCalled();
  });

  it('an unknown reachability (null) after being online does not sync', async () => {
    await renderHook(() => useSyncAutoRetry());
    await emit(online);
    await emit({ isConnected: true, isInternetReachable: null });
    expect(sync).not.toHaveBeenCalled();
    expect(getSyncState().isOffline).toBe(false);
  });

  it('sets the offline flag from NetInfo and clears it on reconnect', async () => {
    await renderHook(() => useSyncAutoRetry());
    await emit(offline);
    expect(getSyncState().isOffline).toBe(true);
    await emit(online);
    expect(getSyncState().isOffline).toBe(false);
  });

  it('unsubscribes from NetInfo on unmount', async () => {
    const { unmount } = await renderHook(() => useSyncAutoRetry());
    await unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('useSyncAutoRetry backoff', () => {
  it('retries on the 30s, 1m, 2m, 5m, 5m schedule while failures continue', async () => {
    await renderHook(() => useSyncAutoRetry());
    await act(async () => reportSyncResult(false));
    const expected = [...RETRY_DELAYS_MS, RETRY_DELAYS_MS[3]];
    for (const [i, delay] of expected.entries()) {
      await act(async () => jest.advanceTimersByTime(delay - 1));
      expect(sync).toHaveBeenCalledTimes(i);
      await act(async () => jest.advanceTimersByTime(1));
      expect(sync).toHaveBeenCalledTimes(i + 1);
      // The real sync would report failure again, re-arming the timer.
      await act(async () => reportSyncStart());
      await act(async () => reportSyncResult(false));
    }
  });

  it('consecutive failures reported without an intervening start keep re-arming', async () => {
    await renderHook(() => useSyncAutoRetry());
    await act(async () => reportSyncResult(false));
    await act(async () => jest.advanceTimersByTime(RETRY_DELAYS_MS[0]));
    expect(sync).toHaveBeenCalledTimes(1);
    // start + fail land in one batch: status stays 'failed' but failureCount changes.
    await act(async () => {
      reportSyncStart();
      reportSyncResult(false);
    });
    await act(async () => jest.advanceTimersByTime(RETRY_DELAYS_MS[1]));
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('resets the schedule after a success', async () => {
    await renderHook(() => useSyncAutoRetry());
    await act(async () => reportSyncResult(false));
    await act(async () => jest.advanceTimersByTime(RETRY_DELAYS_MS[0]));
    await act(async () => reportSyncStart());
    await act(async () => reportSyncResult(false));
    await act(async () => jest.advanceTimersByTime(RETRY_DELAYS_MS[1]));
    expect(sync).toHaveBeenCalledTimes(2);
    await act(async () => reportSyncResult(true));
    await act(async () => reportSyncResult(false));
    await act(async () => jest.advanceTimersByTime(RETRY_DELAYS_MS[0]));
    expect(sync).toHaveBeenCalledTimes(3);
  });

  it('does not schedule retries when sync is not configured', async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    await renderHook(() => useSyncAutoRetry());
    await act(async () => reportSyncResult(false));
    await act(async () => jest.advanceTimersByTime(10 * 60_000));
    expect(sync).not.toHaveBeenCalled();
  });

  it('cancels a pending retry on unmount', async () => {
    const { unmount } = await renderHook(() => useSyncAutoRetry());
    await act(async () => reportSyncResult(false));
    await unmount();
    jest.advanceTimersByTime(10 * 60_000);
    expect(sync).not.toHaveBeenCalled();
  });

  it('pauses retries while the app is backgrounded and resumes when active', async () => {
    let change: (s: string) => void = () => {};
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
      change = cb;
      return { remove };
    }) as never);
    await renderHook(() => useSyncAutoRetry());
    await act(async () => reportSyncResult(false));
    await act(async () => change('background'));
    await act(async () => jest.advanceTimersByTime(10 * 60_000));
    expect(sync).not.toHaveBeenCalled();
    await act(async () => change('active'));
    await act(async () => jest.advanceTimersByTime(RETRY_DELAYS_MS[0]));
    expect(sync).toHaveBeenCalledTimes(1);
  });
});

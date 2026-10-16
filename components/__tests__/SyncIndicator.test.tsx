import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SyncIndicator } from '@/components/SyncIndicator';
import { SYNC_GRACE_MS, reportSyncResult, resetSyncState, setOffline } from '@/lib/sync-status';
import { syncToSupabase } from '@/lib/sync';

jest.mock('@/lib/sync', () => ({ syncToSupabase: jest.fn() }));
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));

const ENV = { url: process.env.EXPO_PUBLIC_SUPABASE_URL, key: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY };

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetSyncState();
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'key';
});

afterEach(() => {
  jest.useRealTimers();
  if (ENV.url === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  else process.env.EXPO_PUBLIC_SUPABASE_URL = ENV.url;
  if (ENV.key === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = ENV.key;
});

describe('SyncIndicator', () => {
  it('renders nothing when sync is healthy', async () => {
    await render(<SyncIndicator />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders nothing for a failure younger than the grace period', async () => {
    await act(async () => reportSyncResult(false, Date.now()));
    await render(<SyncIndicator />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('appears once the failure outlasts the grace period', async () => {
    await act(async () => reportSyncResult(false, Date.now()));
    await render(<SyncIndicator />);
    await act(async () => jest.advanceTimersByTime(SYNC_GRACE_MS + 100));
    expect(screen.getByText('Sync paused')).toBeTruthy();
    expect(screen.getByLabelText('Sync paused. Tap to retry.')).toBeTruthy();
  });

  it('shows offline copy in the label when offline', async () => {
    await act(async () => {
      setOffline(true);
      reportSyncResult(false, Date.now() - SYNC_GRACE_MS - 1);
    });
    await render(<SyncIndicator />);
    expect(screen.getByLabelText('Sync paused · offline. Tap to retry.')).toBeTruthy();
  });

  it('stays hidden when sync is not configured', async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    await act(async () => reportSyncResult(false, Date.now() - SYNC_GRACE_MS - 1));
    await render(<SyncIndicator />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('tapping retries the sync', async () => {
    await act(async () => reportSyncResult(false, Date.now() - SYNC_GRACE_MS - 1));
    await render(<SyncIndicator />);
    await fireEvent.press(screen.getByRole('button'));
    expect(syncToSupabase).toHaveBeenCalledTimes(1);
  });
});

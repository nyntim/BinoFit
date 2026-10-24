import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { getLastSyncAt } from '@/lib/storage';
import { describeBackup, type BackupDescription } from '@/lib/settings-summaries';
import { isSyncConfigured } from '@/lib/sync-status';

/** Backup status line from the sync store, the session and the persisted last sync time. */
export function useBackupStatus(): BackupDescription & { lastSyncAt: number | null | undefined } {
  const auth = useAuth();
  const { state: sync } = useSyncStatus();
  const now = useNow(60_000);
  const [persistedSyncAt, setPersistedSyncAt] = useState<number | null | undefined>(undefined);

  useFocusEffect(useCallback(() => {
    let active = true;
    let generation = 0;
    const refresh = () => {
      const request = ++generation;
      void getLastSyncAt().then(value => {
        if (!active || request !== generation) return;
        const parsed = value ? Date.parse(value) : null;
        setPersistedSyncAt(parsed === null || Number.isFinite(parsed) ? parsed : undefined);
      }).catch(() => { if (active && request === generation) setPersistedSyncAt(undefined); });
    };
    refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { active = false; subscription.remove(); };
  }, []));

  const lastSyncAt = sync.lastSuccessAt ?? persistedSyncAt;
  return { ...describeBackup({ configured: isSyncConfigured(), authStatus: auth.status, sync, lastSyncAt, now }), lastSyncAt };
}

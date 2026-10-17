import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const HEALTH_KIT_SYNC_V1_KEY = 'healthKitSyncV1';

let _current: Promise<void> | null = null;
let _rerun = false;

/** Coalesced Apple Health reconcile; no-op until the user has synced once via Settings. */
export function scheduleAppleHealthSync(): Promise<void> {
  if (Platform.OS !== 'ios') return Promise.resolve();
  if (_current) {
    _rerun = true;
    return _current;
  }
  const run = (async () => {
    try {
      const enabled = await AsyncStorage.getItem(HEALTH_KIT_SYNC_V1_KEY);
      if (enabled !== 'true') return;
      do {
        _rerun = false;
        const { runAppleHealthSyncPass } = await import('@/services/healthKitService');
        await runAppleHealthSyncPass();
      } while (_rerun);
    } catch {
      // Never throw to fire-and-forget callers.
    } finally {
      _current = null;
    }
  })();
  _current = run;
  return run;
}

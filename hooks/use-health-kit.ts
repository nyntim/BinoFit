// Apple Health: dashboard activity reads and Settings sync.
import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import AppleHealthKit from 'react-native-health';
import type { HealthKitPermissions } from 'react-native-health';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchTodayActivityFromHealthKit } from '@/lib/health-kit-activity';
import { HEALTH_KIT_SYNC_V1_KEY } from '@/lib/health-schedule';
import {
  subscribeHealthSync,
  loadLastHealthSync,
  isHealthSyncing,
  getLastHealthSyncAt,
  getLastHealthSyncFailed,
  runAppleHealthSyncPass,
} from '@/services/healthKitService';

const HEALTH_KIT_INITIALIZED_KEY = 'healthKitInitialized';

const HK = (AppleHealthKit as any)?.default || AppleHealthKit;

const LEGACY_PERMISSIONS: HealthKitPermissions = {
  permissions: {
    read: [HK.Constants?.Permissions?.StepCount, HK.Constants?.Permissions?.ActiveEnergyBurned],
    write: [
      HK.Constants?.Permissions?.EnergyConsumed,
      HK.Constants?.Permissions?.Protein,
      HK.Constants?.Permissions?.Carbohydrates,
      HK.Constants?.Permissions?.FatTotal,
    ],
  },
};

const FULL_PERMISSIONS: HealthKitPermissions = {
  permissions: {
    read: [
      HK.Constants?.Permissions?.StepCount,
      HK.Constants?.Permissions?.ActiveEnergyBurned,
      HK.Constants?.Permissions?.BodyMass,
    ],
    write: [
      HK.Constants?.Permissions?.EnergyConsumed,
      HK.Constants?.Permissions?.Protein,
      HK.Constants?.Permissions?.Carbohydrates,
      HK.Constants?.Permissions?.FatTotal,
      HK.Constants?.Permissions?.BodyMass,
      HK.Constants?.Permissions?.Workout,
    ],
  },
};

export function useHealthKit() {
  const syncLock = useRef(false);
  const [available, setAvailable] = useState(false);
  const [syncV1, setSyncV1] = useState(false);
  const [legacyInit, setLegacyInit] = useState(false);
  const [initFailed, setInitFailed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);

  const checkAvailability = useCallback(() => {
    if (Platform.OS !== 'ios') return;
    if (typeof HK.isAvailable === 'function') {
      HK.isAvailable((err: unknown, isAvailable: boolean) => {
        if (err) return;
        setAvailable(isAvailable);
      });
    } else {
      setAvailable(false);
    }
  }, []);

  const initWithPermissions = useCallback((permissions: HealthKitPermissions) => {
    return new Promise<boolean>((resolve) => {
      if (typeof HK.initHealthKit !== 'function') {
        resolve(false);
        return;
      }
      HK.initHealthKit(permissions, (err: unknown) => {
        resolve(!err);
      });
    });
  }, []);

  const initLegacyHealthKit = useCallback(async () => {
    if (Platform.OS !== 'ios') return;
    const ok = await initWithPermissions(LEGACY_PERMISSIONS);
    if (ok) {
      setInitFailed(false);
      await AsyncStorage.setItem(HEALTH_KIT_INITIALIZED_KEY, 'true');
    } else {
      setInitFailed(true);
    }
  }, [initWithPermissions]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    checkAvailability();
    AsyncStorage.multiGet([HEALTH_KIT_SYNC_V1_KEY, HEALTH_KIT_INITIALIZED_KEY]).then(([v1, legacy]) => {
      setSyncV1(v1[1] === 'true');
      setLegacyInit(legacy[1] === 'true');
      if (v1[1] === 'true') {
        void initWithPermissions(FULL_PERMISSIONS).then((ok) => setInitFailed(!ok));
      } else if (legacy[1] === 'true') {
        void initLegacyHealthKit();
      }
    }).catch(() => setInitFailed(true));
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') checkAvailability(); });
    return () => subscription.remove();
  }, [checkAvailability, initLegacyHealthKit, initWithPermissions]);

  useEffect(() => {
    const refresh = () => {
      setLastSyncedAt(getLastHealthSyncAt());
      setSyncFailed(getLastHealthSyncFailed());
      setSyncing(isHealthSyncing());
    };
    void loadLastHealthSync().catch(() => {});
    refresh();
    return subscribeHealthSync(refresh);
  }, []);

  const fetchTodayActivity = useCallback(
    async (force = false) => fetchTodayActivityFromHealthKit(available, force),
    [available]
  );

  const runSync = useCallback(async () => {
    if (Platform.OS !== 'ios' || !available || syncLock.current || isHealthSyncing()) return;
    syncLock.current = true;
    setSyncing(true);
    try {
      setSyncFailed(false);
      const ok = await initWithPermissions(FULL_PERMISSIONS);
      if (!ok) {
        setInitFailed(true);
        setSyncing(false);
        setSyncFailed(true);
        return;
      }
      setInitFailed(false);
      await AsyncStorage.setItem(HEALTH_KIT_SYNC_V1_KEY, 'true');
      setSyncV1(true);
      const result = await runAppleHealthSyncPass();
      setLastSyncedAt(getLastHealthSyncAt());
      setSyncFailed(result === 'failed' || getLastHealthSyncFailed());
    } catch { setSyncFailed(true); }
    finally { syncLock.current = false; setSyncing(false); }
  }, [available, initWithPermissions]);

  return {
    available,
    syncV1,
    legacyInit,
    /** Compatibility flag for attempting reads. HealthKit never reveals read denial. */
    readGranted: legacyInit || syncV1,
    readAccessRequested: legacyInit || syncV1,
    initFailed,
    syncing,
    lastSyncedAt,
    syncFailed,
    fetchTodayActivity,
    runSync,
  };
}

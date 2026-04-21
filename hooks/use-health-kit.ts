// v1.1.0 - Apple Health Integration
import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import AppleHealthKit from 'react-native-health';
import type { HealthKitPermissions } from 'react-native-health';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HEALTH_KIT_INITIALIZED_KEY = 'healthKitInitialized';

// Handle both default and namespace imports for interop
const HK = (AppleHealthKit as any)?.default || AppleHealthKit;

const PERMISSIONS: HealthKitPermissions = {
  permissions: {
    read: [
      HK.Constants?.Permissions?.StepCount,
      HK.Constants?.Permissions?.ActiveEnergyBurned,
    ],
    write: [
      HK.Constants?.Permissions?.EnergyConsumed,
      HK.Constants?.Permissions?.Protein,
      HK.Constants?.Permissions?.Carbohydrates,
      HK.Constants?.Permissions?.FatTotal,
    ],
  },
};

let cachedActivity = { steps: 0, activeCalories: 0 };
let lastFetchTime = 0;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

export function useHealthKit() {
  const [available, setAvailable] = useState(false);
  const [readGranted, setReadGranted] = useState(false);
  const [writeGranted, setWriteGranted] = useState(false);

  const checkAvailability = useCallback(() => {
    if (Platform.OS !== 'ios') return;
    if (typeof HK.isAvailable === 'function') {
      HK.isAvailable((err: any, isAvailable: boolean) => {
        if (err) return;
        setAvailable(isAvailable);
      });
    } else {
      setAvailable(false);
    }
  }, []);

  const initHealthKit = useCallback(async () => {
    if (Platform.OS !== 'ios') return;
    
    if (typeof HK.initHealthKit === 'function') {
      HK.initHealthKit(PERMISSIONS, (err: any) => {
        if (err) {
          console.warn('Error initializing HealthKit:', err);
          return;
        }
        setReadGranted(true);
        setWriteGranted(true);
        AsyncStorage.setItem(HEALTH_KIT_INITIALIZED_KEY, 'true');
      });
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      checkAvailability();
      AsyncStorage.getItem(HEALTH_KIT_INITIALIZED_KEY).then((val) => {
        if (val === 'true') {
          initHealthKit();
        }
      });
    }
  }, [checkAvailability, initHealthKit]);

  const fetchTodayActivity = useCallback(async (): Promise<{ steps: number, activeCalories: number }> => {
    if (Platform.OS !== 'ios' || !available) return { steps: 0, activeCalories: 0 };

    const now = Date.now();
    if (now - lastFetchTime < CACHE_DURATION) {
      return cachedActivity;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const options = {
      startDate: todayStart.toISOString(),
    };

    const getSteps = (): Promise<number> => new Promise((resolve) => {
      if (typeof HK.getStepCount !== 'function') {
        resolve(0);
        return;
      }
      HK.getStepCount(options, (err: any, results: any) => {
        if (err || !results) resolve(0);
        else resolve(results.value);
      });
    });

    const getActiveCalories = (): Promise<number> => new Promise((resolve) => {
      if (typeof HK.getActiveEnergyBurned !== 'function') {
        resolve(0);
        return;
      }
      HK.getActiveEnergyBurned(options, (err: any, results: any) => {
        if (err || !results || results.length === 0) resolve(0);
        else {
          const total = results.reduce((acc: number, cur: any) => acc + (cur.value || 0), 0);
          resolve(total);
        }
      });
    });

    try {
      const [steps, activeCalories] = await Promise.all([getSteps(), getActiveCalories()]);
      cachedActivity = { steps, activeCalories };
      lastFetchTime = Date.now();
      return cachedActivity;
    } catch (error) {
      return { steps: 0, activeCalories: 0 };
    }
  }, [available]);

  return { available, readGranted, writeGranted, initHealthKit, fetchTodayActivity };
}

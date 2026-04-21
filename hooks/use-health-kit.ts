// v1.1.0 - Apple Health Integration
import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import AppleHealthKit, { HealthKitPermissions, HealthValue } from 'react-native-health';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HEALTH_KIT_INITIALIZED_KEY = 'healthKitInitialized';

const PERMISSIONS: HealthKitPermissions = {
  permissions: {
    read: [
      AppleHealthKit.Constants.Permissions.StepCount,
      AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
    ],
    write: [
      AppleHealthKit.Constants.Permissions.EnergyConsumed,
      AppleHealthKit.Constants.Permissions.Protein,
      AppleHealthKit.Constants.Permissions.Carbohydrates,
      AppleHealthKit.Constants.Permissions.FatTotal,
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
    AppleHealthKit.isAvailable((err, isAvailable) => {
      if (err) return;
      setAvailable(isAvailable);
    });
  }, []);

  const initHealthKit = useCallback(async () => {
    if (Platform.OS !== 'ios') return;
    
    AppleHealthKit.initHealthKit(PERMISSIONS, (err) => {
      if (err) {
        console.warn('Error initializing HealthKit:', err);
        return;
      }
      setReadGranted(true);
      setWriteGranted(true);
      AsyncStorage.setItem(HEALTH_KIT_INITIALIZED_KEY, 'true');
    });
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
      AppleHealthKit.getStepCount(options, (err, results) => {
        if (err || !results) resolve(0);
        else resolve(results.value);
      });
    });

    const getActiveCalories = (): Promise<number> => new Promise((resolve) => {
      AppleHealthKit.getActiveEnergyBurned(options, (err, results) => {
        if (err || !results || results.length === 0) resolve(0);
        else {
          const total = results.reduce((acc, cur) => acc + (cur.value || 0), 0);
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

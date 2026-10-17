// Pub/sub store for device-only training preferences. Loaded once on launch;
// setters update memory first, then write through to AsyncStorage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getShowRpe,
  getWeightUnit,
  setShowRpe as persistShowRpe,
  setWeightUnit as persistWeightUnit,
} from '@/lib/storage';
import type { WeightUnit } from '@/lib/types';

export type AppPreferences = {
  weightUnit: WeightUnit;
  showRpe: boolean;
  loaded: boolean;
};

const INITIAL: AppPreferences = {
  weightUnit: 'kg',
  showRpe: false,
  loaded: false,
};

let state: AppPreferences = INITIAL;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<AppPreferences>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      // A throwing listener must not break others.
    }
  });
}

export function getPreferences(): AppPreferences {
  return state;
}

export function subscribePreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reads stored values once; later calls return the same promise. Never throws. */
export function loadPreferences(): Promise<void> {
  if (!loading) {
    loading = Promise.all([getWeightUnit(), getShowRpe()])
      .then(async ([weightUnit, showRpe]) => {
        try {
          await AsyncStorage.removeItem('tracking_mode');
        } catch {
          // Best-effort cleanup of the retired key.
        }
        set({ weightUnit, showRpe, loaded: true });
      })
      .catch(() => {
        set({ loaded: true });
      });
  }
  return loading;
}

/** Re-reads storage, e.g. after sign-out cleared user-owned keys. */
export function reloadPreferences(): Promise<void> {
  loading = null;
  return loadPreferences();
}

export async function setWeightUnit(unit: WeightUnit): Promise<void> {
  set({ weightUnit: unit });
  try {
    await persistWeightUnit(unit);
  } catch {
    // Memory keeps the new value; the next launch re-reads storage.
  }
}

export async function setShowRpe(show: boolean): Promise<void> {
  set({ showRpe: show });
  try {
    await persistShowRpe(show);
  } catch {
    // Memory keeps the new value; the next launch re-reads storage.
  }
}

/** Test helper. */
export function resetPreferences(): void {
  loading = null;
  state = INITIAL;
  listeners.forEach((l) => l());
}

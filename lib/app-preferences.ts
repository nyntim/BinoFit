// Pub/sub store for device-only training preferences. Loaded once on launch;
// setters update memory first, then write through to AsyncStorage.
import {
  getShowRpe,
  getTrackingMode,
  getWeightUnit,
  setShowRpe as persistShowRpe,
  setTrackingMode as persistTrackingMode,
  setWeightUnit as persistWeightUnit,
} from '@/lib/storage';
import type { TrackingMode, WeightUnit } from '@/lib/types';

export type AppPreferences = {
  trackingMode: TrackingMode;
  weightUnit: WeightUnit;
  showRpe: boolean;
  loaded: boolean;
};

const INITIAL: AppPreferences = {
  trackingMode: 'both',
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
    loading = Promise.all([getTrackingMode(), getWeightUnit(), getShowRpe()])
      .then(([trackingMode, weightUnit, showRpe]) => {
        set({ trackingMode, weightUnit, showRpe, loaded: true });
      })
      .catch(() => {
        set({ loaded: true });
      });
  }
  return loading;
}

/** Re-reads storage, e.g. after sign-out cleared the tracking mode. */
export function reloadPreferences(): Promise<void> {
  loading = null;
  return loadPreferences();
}

export async function setTrackingMode(mode: TrackingMode): Promise<void> {
  set({ trackingMode: mode });
  try {
    await persistTrackingMode(mode);
  } catch {
    // Memory keeps the new value; the next launch re-reads storage.
  }
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

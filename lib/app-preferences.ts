import AsyncStorage from '@react-native-async-storage/async-storage';
import * as storage from '@/lib/storage';
import type { LogStatus, WeightUnit } from '@/lib/types';
import { MAX_DEFAULT_SET_COUNT, MIN_DEFAULT_SET_COUNT } from '@/lib/workouts/prefill';
export type AppearancePreference = storage.AppearancePreference;
export type AppPreferences = { weightUnit: WeightUnit; showRpe: boolean; defaultSetCount: number; appearance: AppearancePreference; defaultLogStatus: LogStatus; loaded: boolean; error: string | null };
const INITIAL: AppPreferences = { weightUnit: 'lb', showRpe: false, defaultSetCount: 2, appearance: 'system', defaultLogStatus: 'eaten', loaded: false, error: null };
let state = INITIAL;
let persisted = { ...INITIAL };
let loading: Promise<void> | null = null;
let tail: Promise<void> = Promise.resolve();
let revision = 0;
const fieldRevision: Partial<Record<keyof AppPreferences, number>> = {};
const listeners = new Set<() => void>();
function set(patch: Partial<AppPreferences>) { state = { ...state, ...patch }; listeners.forEach(l => { try { l(); } catch { /* Keep other listeners active. */ } }); }
export function getPreferences() { return state; }
export function subscribePreferences(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function loadPreferences(): Promise<void> {
  if (!loading) {
    const started = revision;
    loading = Promise.all([storage.getWeightUnit(), storage.getShowRpe(), storage.getDefaultSetCount(), storage.getAppearance(), storage.getDefaultLogStatus()]).then(async ([weightUnit, showRpe, defaultSetCount, appearance, defaultLogStatus]) => {
      try { await AsyncStorage.removeItem('tracking_mode'); } catch { /* Retired key cleanup. */ }
      const loaded = { weightUnit, showRpe, defaultSetCount, appearance, defaultLogStatus };
      const patch = Object.fromEntries(Object.entries(loaded).filter(([key]) => (fieldRevision[key as keyof AppPreferences] ?? 0) <= started));
      persisted = { ...persisted, ...patch };
      set({ ...patch, loaded: true, error: null });
    }).catch(() => { set({ loaded: true, error: 'Couldn’t load preferences. Try again.' }); loading = null; });
  }
  return loading;
}
export function reloadPreferences() { loading = null; return loadPreferences(); }
function write<K extends 'weightUnit' | 'showRpe' | 'defaultSetCount' | 'appearance' | 'defaultLogStatus'>(key: K, value: AppPreferences[K], persist: () => Promise<void>): Promise<void> {
  revision++;
  const selectedRevision = revision;
  fieldRevision[key] = selectedRevision;
  set({ [key]: value, error: null });
  const next = tail.catch(() => undefined).then(async () => {
    try {
      await persist();
      persisted = { ...persisted, [key]: value };
    } catch (error) {
      if (fieldRevision[key] === selectedRevision) set({ [key]: persisted[key], error: 'Couldn’t save preferences. Try again.' });
      else set({ error: 'Couldn’t save preferences. Try again.' });
      throw error;
    }
  });
  tail = next;
  return next;
}
export function setWeightUnit(unit: WeightUnit) { return write('weightUnit', unit, () => storage.setWeightUnit(unit)); }
export function setAppearance(value: AppearancePreference) { return write('appearance', value, () => storage.setAppearance(value)); }
export function setDefaultLogStatus(value: LogStatus) { return write('defaultLogStatus', value, () => storage.setDefaultLogStatus(value)); }
export function setShowRpe(value: boolean) { return write('showRpe', value, () => storage.setShowRpe(value)); }
export function setDefaultSetCount(value: number): Promise<void> {
  if (!Number.isInteger(value) || value < MIN_DEFAULT_SET_COUNT || value > MAX_DEFAULT_SET_COUNT) return Promise.resolve();
  return write('defaultSetCount', value, () => storage.setDefaultSetCount(value));
}
export function resetPreferences() { revision++; Object.keys(fieldRevision).forEach(key => delete fieldRevision[key as keyof AppPreferences]); loading = null; tail = Promise.resolve(); state = INITIAL; persisted = { ...INITIAL }; listeners.forEach(l => l()); }

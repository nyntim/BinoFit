// Pure helpers for the tracking mode (what the user wants to track).
import type { TrackingMode } from '@/lib/types';

export type TabName = 'index' | 'training' | 'progress' | 'settings';

/** Home is hidden in training mode, Training in nutrition mode; Progress and More always show. */
export function isTabVisible(tab: TabName, mode: TrackingMode): boolean {
  if (tab === 'index') return mode !== 'training';
  if (tab === 'training') return mode !== 'nutrition';
  return true;
}

/** Route to land on after onboarding or sign-in. */
export function homeRouteFor(mode: TrackingMode): '/(tabs)' | '/(tabs)/training' {
  return mode === 'training' ? '/(tabs)/training' : '/(tabs)';
}

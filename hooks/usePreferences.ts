import { useSyncExternalStore } from 'react';
import { getPreferences, subscribePreferences, type AppPreferences } from '@/lib/app-preferences';

/** Training preferences (tracking mode, weight unit, Show RPE); re-renders on change. */
export function usePreferences(): AppPreferences {
  return useSyncExternalStore(subscribePreferences, getPreferences, getPreferences);
}

import { useSyncExternalStore } from 'react';
import { getPreferences, subscribePreferences, type AppPreferences } from '@/lib/app-preferences';

/** Training preferences (weight unit, effort, rest timer, default set count); re-renders on change. */
export function usePreferences(): AppPreferences {
  return useSyncExternalStore(subscribePreferences, getPreferences, getPreferences);
}

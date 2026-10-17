import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** The current time in ms, refreshed every `intervalMs` (and when the app returns to the foreground). Pass `enabled = false` to stop the timer. */
export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [intervalMs, enabled]);
  return now;
}

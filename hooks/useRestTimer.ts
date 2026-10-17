import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNow } from '@/hooks/useNow';
import type { RestTimerState } from '@/lib/types';
import { remainingSeconds } from '@/lib/workouts/rest-timer';
import {
  addRestSeconds,
  expireRestTimer,
  getRestTimerState,
  stopRestTimer,
  subscribeRestTimer,
  subtractRestSeconds,
} from '@/lib/workouts/rest-timer-store';

export type UseRestTimer = {
  timer: RestTimerState | null;
  /** Whole seconds left (0 when there is no timer). */
  remaining: number;
  add: () => void;
  subtract: () => void;
  skip: () => void;
};

/** The running rest timer and its countdown, ticking each second. Clears itself at zero. */
export function useRestTimer(): UseRestTimer {
  const { timer } = useSyncExternalStore(subscribeRestTimer, getRestTimerState, getRestTimerState);
  const now = useNow(1000, !!timer);
  const remaining = timer ? remainingSeconds(timer, now) : 0;

  const announced = useRef<number | null>(null);
  useEffect(() => {
    if (!timer || remaining > 0) return;
    // Once per rest: a light haptic and a spoken "Rest over" when the countdown ends in the app.
    if (announced.current !== timer.endsAt) {
      announced.current = timer.endsAt;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      AccessibilityInfo.announceForAccessibility('Rest over');
    }
    expireRestTimer();
  }, [timer, remaining]);

  return {
    timer,
    remaining,
    add: addRestSeconds,
    subtract: subtractRestSeconds,
    skip: () => void stopRestTimer(),
  };
}

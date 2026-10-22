// Pub/sub store of the running rest timer, kept in step with AsyncStorage (so it survives a restart)
// and the local "Rest over" notification. Every function is fire-and-forget safe: none throws.
// Callers: the live session (tick starts, untick cancels), finish/discard, wipe and app launch.
import { getPreferences, loadPreferences } from '@/lib/app-preferences';
import { getActiveRestTimer, setActiveRestTimer } from '@/lib/storage';
import type { RestTimerState } from '@/lib/types';
import {
  cancelAllRestNotifications,
  cancelRestNotification,
  scheduleRestNotification,
} from '@/lib/workouts/rest-notifications';
import { REST_ADJUST_SECONDS, adjustRest, restoreRest, startRest } from '@/lib/workouts/rest-timer';

export type RestTimerStoreState = {
  timer: RestTimerState | null;
};

let state: RestTimerStoreState = { timer: null };
const listeners = new Set<() => void>();

function emit(timer: RestTimerState | null): void {
  state = { timer };
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      // A throwing listener must not break others.
    }
  });
}

export function getRestTimerState(): RestTimerStoreState {
  return state;
}

export function subscribeRestTimer(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function persist(timer: RestTimerState | null): void {
  setActiveRestTimer(timer).catch((error) => console.error('Failed to save rest timer:', error));
}

/**
 * Starts a rest after a set is ticked, replacing any running one. A duration of 0 (rest off)
 * ends the running timer instead. The first start asks for notification permission.
 */
export function startRestTimer(
  input: { workoutId: string; durationSeconds: number; workoutExerciseId?: string; setId?: string; exerciseName?: string },
  now: number = Date.now()
): RestTimerState | null {
  if (!getPreferences().restTimerEnabled) {
    // Global switch off: no timer, notification or permission prompt. Also ends any running rest.
    if (state.timer) void stopRestTimer();
    return null;
  }
  const timer = startRest(input.workoutId, input.durationSeconds, now, input);
  emit(timer);
  persist(timer);
  if (timer) void scheduleRestNotification(timer.workoutId, timer.endsAt, timer.exerciseName, { prompt: true, now });
  else void cancelRestNotification(input.workoutId);
  return timer;
}

/** -15s / +15s. A -15s with 15 s or less left ends the timer. The exercise's saved rest is unchanged. */
export function adjustRestTimer(deltaSeconds: number, now: number = Date.now()): void {
  const current = state.timer;
  if (!current) return;
  const next = adjustRest(current, deltaSeconds, now);
  emit(next);
  persist(next);
  if (next) void scheduleRestNotification(next.workoutId, next.endsAt, next.exerciseName, { prompt: false, now });
  else void cancelRestNotification(current.workoutId);
}

export const addRestSeconds = () => adjustRestTimer(REST_ADJUST_SECONDS);
export const subtractRestSeconds = () => adjustRestTimer(-REST_ADJUST_SECONDS);

/** Skip, un-tick, finish and discard: ends the running timer and cancels its notification. */
export function stopRestTimer(workoutId?: string): Promise<void> {
  const current = state.timer;
  if (current && (!workoutId || current.workoutId === workoutId)) {
    emit(null);
    persist(null);
  }
  const id = workoutId ?? current?.workoutId;
  return id ? cancelRestNotification(id) : Promise.resolve();
}

/** Un-tick: ends the running timer only when `setId` is the set that started it. */
export function stopRestTimerForSet(workoutId: string, setId: string): Promise<void> {
  const current = state.timer;
  if (!current || current.workoutId !== workoutId || current.setId !== setId) return Promise.resolve();
  return stopRestTimer(workoutId);
}

/** The countdown reached zero in the app: clear it. The notification (if any) fires on its own. */
export function expireRestTimer(): void {
  if (!state.timer) return;
  emit(null);
  persist(null);
}

/** Sign-out wipe: forget the timer and cancel every rest notification. */
export async function clearRestTimerAndNotifications(): Promise<void> {
  emit(null);
  try {
    await setActiveRestTimer(null);
  } catch (error) {
    console.error('Failed to clear rest timer:', error);
  }
  await cancelAllRestNotifications();
}

/**
 * On launch (after the active workout is read): resumes the stored timer when it belongs to the
 * active workout and has not ended, re-arming its notification without prompting. Anything else
 * is cleared. Never throws.
 */
export async function restoreRestTimer(activeWorkoutId: string | null, now: number = Date.now()): Promise<void> {
  try {
    if (state.timer) return; // a rest already started in this launch wins over the stored one
    await loadPreferences();
    if (!getPreferences().restTimerEnabled) {
      await clearRestTimerAndNotifications();
      return;
    }
    const stored = await getActiveRestTimer();
    const timer = restoreRest(stored, activeWorkoutId, now);
    if (timer) {
      emit(timer);
      void scheduleRestNotification(timer.workoutId, timer.endsAt, timer.exerciseName, { prompt: false, now });
      return;
    }
    if (stored) await clearRestTimerAndNotifications();
    else await cancelAllRestNotifications();
  } catch (error) {
    console.error('Failed to restore rest timer:', error);
  }
}

/** Test helper. */
export function resetRestTimerStore(): void {
  state = { timer: null };
}

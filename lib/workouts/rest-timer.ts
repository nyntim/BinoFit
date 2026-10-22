// Pure rest-timer rules. The timer stores an absolute end time; the UI derives the remaining time,
// so backgrounding and app kills never drift it. `now` is always passed in (epoch ms).
import type { RestTimerState } from '@/lib/types';
import { formatDuration } from '@/lib/units';
import { DEFAULT_REST_SECONDS } from '@/lib/workouts/prefill';

/** Size of the -15s / +15s buttons. */
export const REST_ADJUST_SECONDS = 15;

type RestMeta = { workoutExerciseId?: string; setId?: string; exerciseName?: string };

/** Label for a rest choice: "No rest" for 0, else m:ss. */
export function restChoiceLabel(seconds: number): string {
  return seconds === 0 ? 'No rest' : formatDuration(seconds);
}

/** Rest to start after a tick: 0 when the global rest timer is off, else the saved rest or the default. */
export function restSecondsForTick(restSeconds: number | null | undefined, enabled: boolean): number {
  if (!enabled) return 0;
  return restSeconds ?? DEFAULT_REST_SECONDS;
}

/** Starts a rest of `durationSeconds`. Returns null when the duration is 0 or less (rest off). */
export function startRest(
  workoutId: string,
  durationSeconds: number,
  now: number,
  meta: RestMeta = {}
): RestTimerState | null {
  const seconds = Math.round(durationSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return {
    workoutId,
    endsAt: now + seconds * 1000,
    durationSeconds: seconds,
    ...(meta.workoutExerciseId ? { workoutExerciseId: meta.workoutExerciseId } : {}),
    ...(meta.setId ? { setId: meta.setId } : {}),
    ...(meta.exerciseName ? { exerciseName: meta.exerciseName } : {}),
  };
}

/** Whole seconds left, rounded up (so "0:01" shows until the end), never negative. */
export function remainingSeconds(timer: RestTimerState, now: number): number {
  return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
}

/**
 * Moves the end time by `deltaSeconds` (+15 or -15). Returns null when nothing would be left
 * (a -15s with 15 s or less remaining ends the timer). Adding extends the total duration; the
 * saved per-exercise rest is never touched.
 */
export function adjustRest(timer: RestTimerState, deltaSeconds: number, now: number): RestTimerState | null {
  const endsAt = timer.endsAt + deltaSeconds * 1000;
  if (endsAt <= now) return null;
  return {
    ...timer,
    endsAt,
    durationSeconds: Math.max(1, timer.durationSeconds + deltaSeconds),
  };
}

/**
 * The timer to resume after a restart: the stored one when it belongs to the active workout and has
 * not ended, otherwise null.
 */
export function restoreRest(
  stored: RestTimerState | null,
  activeWorkoutId: string | null,
  now: number
): RestTimerState | null {
  if (!stored || !activeWorkoutId || stored.workoutId !== activeWorkoutId) return null;
  return stored.endsAt > now ? stored : null;
}

/** Notification body for a finished rest. */
export function restNotificationBody(exerciseName: string | undefined): string {
  return exerciseName ? `Next set: ${exerciseName}.` : 'Next set.';
}

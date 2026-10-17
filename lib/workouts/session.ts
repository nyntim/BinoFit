// The live session lifecycle: start, resume, finish and discard. Pure rules take `now` so they can
// be tested; the DB functions call the store so the session bar and Training tab update.
import { format } from 'date-fns';
import { syncToSupabase } from '@/lib/sync';
import type { Workout, WorkoutWithExercises } from '@/lib/types';
import { planFinish } from '@/lib/workouts/completion';
import {
  ActiveWorkoutExistsError,
  createWorkout,
  discardWorkout,
  getActiveWorkout,
  getWorkoutWithExercises,
} from '@/lib/workouts/db';
import { applyCompletionPlan } from '@/lib/workouts/drafts';
import { setActiveWorkout } from '@/lib/workouts/active-workout-store';

/** A session with no ticked set (or start) for this long is stale: the user probably forgot to finish. */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export type FinishResult = 'finished' | 'needs-confirm' | 'empty' | 'gone';

/** Starts an empty live workout dated today. If one is already active (double tap), returns it. */
export async function startEmptyWorkout(now: Date): Promise<Workout> {
  try {
    const w = await createWorkout({
      date: format(now, 'yyyy-MM-dd'),
      status: 'active',
      source: 'live',
      started_at: now.toISOString(),
    });
    setActiveWorkout(w);
    return w;
  } catch (e) {
    if (e instanceof ActiveWorkoutExistsError) {
      const existing = await getActiveWorkout();
      if (existing) {
        setActiveWorkout(existing);
        return existing;
      }
    }
    throw e;
  }
}

/** The last time the user did something in the session: the latest ticked set, else the start. */
export function lastActivityAt(w: WorkoutWithExercises): Date {
  let latest = new Date(w.started_at ?? w.created_at).getTime();
  for (const ex of w.exercises) {
    for (const s of ex.sets) {
      if (!s.completed_at) continue;
      const t = new Date(s.completed_at).getTime();
      if (!Number.isNaN(t) && (Number.isNaN(latest) || t > latest)) latest = t;
    }
  }
  return new Date(latest);
}

/** True when `now` is at least STALE_AFTER_MS (6 h) after the last activity. */
export function isStale(w: WorkoutWithExercises, now: Date): boolean {
  const last = lastActivityAt(w).getTime();
  if (Number.isNaN(last)) return false;
  return now.getTime() - last >= STALE_AFTER_MS;
}

/**
 * Finishes a live workout. 'gone': the workout is missing or no longer active. 'empty': no set is ticked, nothing changed. 'needs-confirm': sets with
 * values are not ticked and `discardUnticked` is false, nothing changed. 'finished': empty sets
 * (and, with `discardUnticked`, unticked ones) are dropped, the workout is done, ends at `endAt`
 * (default now), is dated by its start, and sync starts. Callers flush the editor first.
 */
export async function finishWorkout(
  id: string,
  options: { endAt?: Date; discardUnticked: boolean },
  now: Date
): Promise<FinishResult> {
  const w = await getWorkoutWithExercises(id);
  if (!w || w.status !== 'active') return 'gone';
  const plan = planFinish(w, now, options);
  if (!plan.hasData) return 'empty';
  if (plan.needsConfirm) return 'needs-confirm';
  await applyCompletionPlan(id, plan);
  setActiveWorkout(null);
  syncToSupabase();
  return 'finished';
}

/** Throws the active session away (hard delete) and clears the store. */
export async function discardActiveWorkout(id: string): Promise<void> {
  await discardWorkout(id);
  setActiveWorkout(null);
}

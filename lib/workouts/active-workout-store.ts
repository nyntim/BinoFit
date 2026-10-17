// Pub/sub store of the active (live) workout, read by the session screen, the session bar and the
// Training tab. Fed by refreshActiveWorkout() on launch and by setActiveWorkout() after a start,
// finish or discard.
import type { Workout } from '@/lib/types';
import { getActiveWorkout } from '@/lib/workouts/db';

export type ActiveWorkoutState = {
  workout: Workout | null;
  /** False until the first read finished. */
  loaded: boolean;
};

let state: ActiveWorkoutState = { workout: null, loaded: false };
const listeners = new Set<() => void>();

function emit(next: ActiveWorkoutState): void {
  state = next;
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      // A throwing listener must not break others.
    }
  });
}

export function getActiveWorkoutState(): ActiveWorkoutState {
  return state;
}

export function subscribeActiveWorkout(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Sets the active workout directly (null after finish or discard). */
export function setActiveWorkout(workout: Workout | null): void {
  emit({ workout, loaded: true });
}

/** Reads the active workout from SQLite. Never throws; on error the state is kept. */
export async function refreshActiveWorkout(): Promise<void> {
  try {
    setActiveWorkout(await getActiveWorkout());
  } catch {
    if (!state.loaded) emit({ ...state, loaded: true });
  }
}

/** Test helper: back to the initial state. */
export function resetActiveWorkoutStore(): void {
  state = { workout: null, loaded: false };
}

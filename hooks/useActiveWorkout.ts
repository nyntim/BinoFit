import { useSyncExternalStore } from 'react';
import {
  getActiveWorkoutState,
  subscribeActiveWorkout,
  type ActiveWorkoutState,
} from '@/lib/workouts/active-workout-store';

/** The active workout (null when none) and whether the first read finished; re-renders on change. */
export function useActiveWorkout(): ActiveWorkoutState {
  return useSyncExternalStore(subscribeActiveWorkout, getActiveWorkoutState, getActiveWorkoutState);
}

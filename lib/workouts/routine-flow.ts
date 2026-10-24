// Native Alert flow around "Save as routine" from a finished workout (detail screen and history).
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { syncToSupabase } from '@/lib/sync';
import { saveWorkoutAsRoutine, startLiveFromRoutine } from '@/lib/workouts/routines';
import type { RoutineWithExercises } from '@/lib/types';

/**
 * Copies the workout into a new routine, then confirms. A workout with no sets shows "Nothing to
 * save". Callers flush any pending editor writes first. Never throws.
 */
export async function saveAsRoutineWithFeedback(
  workoutId: string,
  opts: { onSaved?: (routine: RoutineWithExercises) => void } = {}
): Promise<void> {
  try {
    const routine = await saveWorkoutAsRoutine(workoutId);
    if (!routine) {
      Alert.alert('Nothing to save', 'This workout has no sets to copy.');
      return;
    }
    syncToSupabase();
    opts.onSaved?.(routine);
    Alert.alert(`Saved as ${routine.name}.`, undefined, [
      { text: 'OK', style: 'cancel' },
      { text: 'View routine', onPress: () => router.push({ pathname: '/workout/routine', params: { id: routine.id } }) },
    ]);
  } catch {
    Alert.alert('Couldn’t save the routine.', 'Try again.');
  }
}

/**
 * Starts a live workout from the routine and opens the session, with the Alerts for an empty
 * routine, a workout already in progress and failures. Never throws.
 */
export async function startRoutineWithFeedback(routineId: string): Promise<'started' | 'not-started'> {
  try {
    const result = await startLiveFromRoutine(routineId, new Date());
    if (result === 'empty') {
      Alert.alert('Add an exercise first.');
      return 'not-started';
    }
    if (result === 'active') {
      Alert.alert('A workout is already in progress.', undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Resume', onPress: () => router.push('/workout/session') },
      ]);
      return 'not-started';
    }
    router.push('/workout/session');
    return 'started';
  } catch {
    Alert.alert('Couldn’t start the workout.', 'Try again.');
    return 'not-started';
  }
}

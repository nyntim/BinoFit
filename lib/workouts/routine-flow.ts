// Native Alert flow around "Save as routine" from a finished workout (detail screen and history).
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { syncToSupabase } from '@/lib/sync';
import { saveWorkoutAsRoutine } from '@/lib/workouts/routines';
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

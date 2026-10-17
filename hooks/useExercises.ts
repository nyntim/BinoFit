import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getCustomExerciseBrands, getExercises } from '@/lib/workouts/exercises';
import type { Exercise } from '@/lib/types';

export type ExercisesState = {
  exercises: Exercise[];
  /** Brands used on custom exercises, most recent first. */
  brands: string[];
  status: 'loading' | 'ready' | 'error';
  reload: () => Promise<void>;
};

/** Exercises and brands; reloads whenever the screen gains focus. */
export function useExercises(): ExercisesState {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [status, setStatus] = useState<ExercisesState['status']>('loading');
  const latestCall = useRef(0);

  const reload = useCallback(async () => {
    const call = ++latestCall.current;
    try {
      const [list, brandList] = await Promise.all([getExercises(), getCustomExerciseBrands()]);
      if (call !== latestCall.current) return;
      setExercises(list);
      setBrands(brandList);
      setStatus('ready');
    } catch {
      if (call !== latestCall.current) return;
      setStatus('error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  return { exercises, brands, status, reload };
}

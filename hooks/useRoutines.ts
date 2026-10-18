import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getRoutines } from '@/lib/workouts/routines';
import type { RoutineWithExercises } from '@/lib/types';

export type RoutinesOverview = {
  status: 'loading' | 'ready' | 'error';
  routines: RoutineWithExercises[];
  setRoutines: React.Dispatch<React.SetStateAction<RoutineWithExercises[]>>;
  reload: () => void;
};

/** Live routines with their exercises, reloaded whenever the screen gains focus. */
export function useRoutines(): RoutinesOverview {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [routines, setRoutines] = useState<RoutineWithExercises[]>([]);
  const requestRef = useRef(0);

  const reload = useCallback(() => {
    const request = ++requestRef.current;
    getRoutines()
      .then((list) => {
        if (request !== requestRef.current) return;
        setRoutines(list);
        setStatus('ready');
      })
      .catch(() => {
        if (request !== latest(requestRef)) return;
        setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
      });
  }, []);

  useFocusEffect(reload);

  return { status, routines, setRoutines, reload };
}

function latest(ref: { current: number }): number {
  return ref.current;
}

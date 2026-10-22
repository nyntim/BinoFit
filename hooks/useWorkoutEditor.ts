import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { syncToSupabase } from '@/lib/sync';
import type { SetType, WorkoutSet, WorkoutWithExercises } from '@/lib/types';
import { getPreferences } from '@/lib/app-preferences';
import { tickPatch } from '@/lib/workouts/completion';
import {
  addWorkoutSet,
  buildWorkoutSetRow,
  deleteWorkoutSet,
  getWorkoutWithExercises,
  removeWorkoutExercise,
  updateWorkout,
  updateWorkoutExercise,
  updateWorkoutSet,
  type SetValues,
  type WorkoutExercisePatch,
  type WorkoutPatch,
} from '@/lib/workouts/db';
import { editorReducer, type EditorAction } from '@/lib/workouts/editor-state';
import { waitForCleanup } from '@/lib/workouts/drafts';
import { commitPendingEdits } from '@/lib/workouts/pending-edits';
import { getPreviousPerformance } from '@/lib/workouts/previous';
import { getPriorRecordSets } from '@/lib/workouts/record-history';
import { recordsByExercise, type RecordValues } from '@/lib/workouts/records';
import { createWriteQueue, type WriteQueue } from '@/lib/workouts/write-queue';

export type EditorMode = 'live' | 'manual' | 'edit';
export type EditorStatus = 'loading' | 'ready' | 'missing' | 'error';

export type ToggleResult = {
  ticked: boolean;
  setId: string;
  workoutExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  /** The exercise's rest in seconds (null when unset, 0 means off). */
  restSeconds: number | null;
};

export type WorkoutEditor = {
  workout: WorkoutWithExercises | null;
  status: EditorStatus;
  /** True after a write to SQLite failed (the screen was reloaded from SQLite). */
  writeError: boolean;
  /** Latest earlier performance of each exercise in the workout (exercise id to sets). */
  previous: Map<string, WorkoutSet[]>;
  /** Prior personal records per weight_reps exercise; null while loading or if the prior query failed. */
  priorRecords: Map<string, RecordValues> | null;
  /** Hides the write-error state after the user saw it. */
  clearWriteError: () => void;
  /** Loads from SQLite after pending writes finish. */
  reload: () => Promise<void>;
  /** Commits typed-but-pending text (cells, name, duration), then resolves when every queued write has finished. Call before navigating away or saving. */
  flush: () => Promise<void>;
  addSet: (workoutExerciseId: string) => void;
  updateSet: (setId: string, patch: SetValues) => void;
  setSetType: (setId: string, type: SetType) => void;
  deleteSet: (setId: string) => void;
  removeExercise: (workoutExerciseId: string) => void;
  updateExercise: (workoutExerciseId: string, patch: WorkoutExercisePatch) => void;
  updateMeta: (patch: WorkoutPatch) => void;
  /** Ticks or unticks a set. Ticking an empty set copies the Previous values. */
  toggleDone: (setId: string) => ToggleResult | null;
};

/**
 * Drives the shared workout editor. SQLite is the source of truth: every action updates the screen
 * state at once and writes through a serial queue (so adding a set and editing it keep their order).
 * Edits to a finished workout (`mode === 'edit'`) trigger a fire-and-forget sync.
 */
export function useWorkoutEditor(id: string | undefined, mode: EditorMode): WorkoutEditor {
  const [workout, setWorkout] = useState<WorkoutWithExercises | null>(null);
  const [status, setStatus] = useState<EditorStatus>('loading');
  const [writeError, setWriteError] = useState(false);
  const [previous, setPrevious] = useState<Map<string, WorkoutSet[]>>(new Map());
  const [priorRecords, setPriorRecords] = useState<Map<string, RecordValues> | null>(null);

  const workoutRef = useRef<WorkoutWithExercises | null>(null);
  const previousRef = useRef(previous);
  const requestRef = useRef(0);
  const priorRequestRef = useRef(0);
  /** Bumped by every optimistic action; a load that sees it change re-reads. */
  const versionRef = useRef(0);
  const loadedOnce = useRef(false);
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const writeFailedRef = useRef<() => void>(() => undefined);
  // The ref is only read when a write fails, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [queue] = useState<WriteQueue>(() => createWriteQueue(() => writeFailedRef.current()));

  const apply = useCallback((action: EditorAction) => {
    versionRef.current += 1;
    workoutRef.current = editorReducer(workoutRef.current, action);
    setWorkout(workoutRef.current);
  }, []);

  const load = useCallback(
    async (silent: boolean) => {
      if (!id) return;
      const request = ++requestRef.current;
      if (!silent) setStatus('loading');
      try {
        // Re-read when an action happened (or a write is still queued) while we were reading.
        for (let attempt = 0; attempt < 4; attempt++) {
          await waitForCleanup();
          await queue.drain();
          const version = versionRef.current;
          const w = await getWorkoutWithExercises(id);
          if (request !== requestRef.current) return;
          if (!w) {
            workoutRef.current = null;
            setWorkout(null);
            setStatus('missing');
            return;
          }
          const before = w.started_at ?? w.created_at;
          const prev = await getPreviousPerformance(
            w.exercises.map((e) => e.exercise_id),
            { excludeWorkoutId: w.id, before }
          );
          const weightRepsIds = w.exercises
            .filter((e) => e.exercise?.log_type === 'weight_reps')
            .map((e) => e.exercise_id);
          let priors: Map<string, RecordValues> | null = null;
          try {
            const priorSets = await getPriorRecordSets(weightRepsIds, {
              excludeWorkoutId: w.id,
              before,
            });
            priors = recordsByExercise(priorSets);
          } catch {
            priors = null;
          }
          if (request !== requestRef.current) return;
          if (versionRef.current !== version || queue.pending() > 0) continue;
          priorRequestRef.current += 1;
          workoutRef.current = w;
          previousRef.current = prev;
          setWorkout(w);
          setPrevious(prev);
          setPriorRecords(priors);
          setStatus('ready');
          loadedOnce.current = true;
          return;
        }
        // Edits kept arriving: the screen state is already current, keep it.
        if (workoutRef.current) setStatus('ready');
      } catch {
        if (request !== requestRef.current) return;
        // A silent refresh keeps what is on screen.
        if (!silent || !workoutRef.current) setStatus('error');
      }
    },
    [id, queue]
  );

  useEffect(() => {
    writeFailedRef.current = () => {
      setWriteError(true);
      void load(true);
    };
  }, [load]);

  useEffect(() => {
    loadedOnce.current = false;
    workoutRef.current = null;
    setWorkout(null);
    setPriorRecords(null);
    if (id) void load(false);
  }, [id, load]);

  // Returning from the exercise picker or builder: pick up exercises added there.
  useFocusEffect(
    useCallback(() => {
      if (loadedOnce.current) {
        void load(true).then(() => {
          if (modeRef.current === 'edit') syncToSupabase();
        });
      }
    }, [load])
  );

  const write = useCallback(
    (task: () => Promise<unknown>) => {
      void queue.enqueue(async () => {
        await task();
        if (modeRef.current === 'edit') syncToSupabase();
      });
    },
    [queue]
  );

  const findSet = (setId: string) => {
    const w = workoutRef.current;
    if (!w) return null;
    for (const ex of w.exercises) {
      const index = ex.sets.findIndex((s) => s.id === setId);
      if (index >= 0) return { ex, set: ex.sets[index], index };
    }
    return null;
  };

  const addSet = useCallback(
    (workoutExerciseId: string) => {
      const w = workoutRef.current;
      const ex = w?.exercises.find((e) => e.id === workoutExerciseId);
      if (!w || !ex) return;
      const position = ex.sets.reduce((max, s) => Math.max(max, s.position), -1) + 1;
      const row = buildWorkoutSetRow({ workout_exercise_id: workoutExerciseId }, w.id, position);
      apply({ type: 'addSet', set: row });
      write(() => addWorkoutSet({ id: row.id, workout_exercise_id: workoutExerciseId }));
    },
    [apply, write]
  );

  const updateSet = useCallback(
    (setId: string, patch: SetValues) => {
      apply({ type: 'updateSet', id: setId, patch });
      write(() => updateWorkoutSet(setId, patch));
    },
    [apply, write]
  );

  const setSetType = useCallback((setId: string, type: SetType) => updateSet(setId, { set_type: type }), [updateSet]);

  const deleteSet = useCallback(
    (setId: string) => {
      apply({ type: 'deleteSet', id: setId });
      write(() => deleteWorkoutSet(setId));
    },
    [apply, write]
  );

  const removeExercise = useCallback(
    (workoutExerciseId: string) => {
      apply({ type: 'removeExercise', id: workoutExerciseId });
      write(() => removeWorkoutExercise(workoutExerciseId));
    },
    [apply, write]
  );

  const updateExercise = useCallback(
    (workoutExerciseId: string, patch: WorkoutExercisePatch) => {
      apply({ type: 'updateExercise', id: workoutExerciseId, patch });
      write(() => updateWorkoutExercise(workoutExerciseId, patch));
    },
    [apply, write]
  );

  const updateMeta = useCallback(
    (patch: WorkoutPatch) => {
      if (!id) return;
      const prevStartedAt = workoutRef.current?.started_at;
      apply({ type: 'meta', patch });
      write(() => updateWorkout(id, patch));
      const nextWorkout = workoutRef.current;
      if (patch.started_at !== undefined && patch.started_at !== prevStartedAt && nextWorkout) {
        const req = ++priorRequestRef.current;
        const weightRepsIds = nextWorkout.exercises
          .filter((e) => e.exercise?.log_type === 'weight_reps')
          .map((e) => e.exercise_id);
        const before = nextWorkout.started_at ?? nextWorkout.created_at;
        void getPriorRecordSets(weightRepsIds, { excludeWorkoutId: nextWorkout.id, before })
          .then((sets) => {
            if (req === priorRequestRef.current) {
              setPriorRecords(recordsByExercise(sets));
            }
          })
          .catch(() => {
            // Keep the map already shown on failure.
          });
      }
    },
    [apply, write, id]
  );

  const toggleDone = useCallback(
    (setId: string): ToggleResult | null => {
      commitPendingEdits();
      const preferences = getPreferences();
      const found = findSet(setId);
      if (!found) return null;
      const { ex, set, index } = found;
      const ticked = !set.completed_at;
      const patch: SetValues = ticked
        ? tickPatch(set, ex.exercise?.log_type ?? 'weight_reps', previousRef.current.get(ex.exercise_id)?.[index] ?? null, new Date().toISOString(), preferences.showEffort ? preferences.effortMetric : null)
        : { completed_at: null };
      updateSet(setId, patch);
      return {
        ticked,
        setId,
        workoutExerciseId: ex.id,
        exerciseId: ex.exercise_id,
        exerciseName: ex.exercise_name,
        restSeconds: ex.rest_seconds,
      };
    },
    [updateSet]
  );

  const reload = useCallback(() => load(!!workoutRef.current), [load]);
  const flush = useCallback(async () => {
    Keyboard.dismiss();
    commitPendingEdits();
    await queue.drain();
  }, [queue]);
  const clearWriteError = useCallback(() => setWriteError(false), []);

  return {
    workout,
    status,
    writeError,
    previous,
    priorRecords,
    reload,
    flush,
    clearWriteError,
    addSet,
    updateSet,
    setSetType,
    deleteSet,
    removeExercise,
    updateExercise,
    updateMeta,
    toggleDone,
  };
}

import { addDays, format, subHours } from 'date-fns';
import { getDatabase } from '@/lib/database';
import { tombstoneSql } from '@/lib/tombstones';
import type { Workout } from '@/lib/types';
import { planSave, type SavePlan } from '@/lib/workouts/completion';
import {
  createWorkout,
  discardWorkout,
  getWorkoutWithExercises,
  updateWorkout,
} from '@/lib/workouts/db';

export const DRAFT_MAX_AGE_DAYS = 7;
const DEFAULT_START_HOURS_AGO = 1;
const DEFAULT_DURATION_SECONDS = 3600;

/**
 * The draft behind "Log past workout": the newest existing draft, else a new one dated today that
 * started an hour ago and lasted an hour.
 */
export function getOrCreateDraft(now: Date): Promise<Workout> {
  // One at a time: a double tap must not create two drafts.
  const run = draftLock.then(() => getOrCreateDraftNow(now));
  draftLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

let draftLock: Promise<void> = Promise.resolve();

async function getOrCreateDraftNow(now: Date): Promise<Workout> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<Workout>(
    `SELECT * FROM workouts WHERE status = 'draft' AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`
  );
  if (existing) return existing;
  const start = subHours(now, DEFAULT_START_HOURS_AGO);
  return createWorkout({
    date: format(start, 'yyyy-MM-dd'),
    status: 'draft',
    source: 'manual',
    started_at: start.toISOString(),
    duration_seconds: DEFAULT_DURATION_SECONDS,
  });
}

/**
 * Applies a completion plan to a workout in one transaction: removes the listed exercises with
 * their sets, deletes the listed sets (hard for a draft or active workout, tombstones for a done
 * one) and ticks the rest; then writes the workout patch.
 */
export async function applyCompletionPlan(workoutId: string, plan: SavePlan): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ status: string }>('SELECT status FROM workouts WHERE id = ?', [workoutId]);
  if (!row) return;
  const done = row.status === 'done';
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const id of plan.removeExerciseIds) {
      if (done) {
        await txn.runAsync(`${tombstoneSql('workout_sets')} WHERE workout_exercise_id = ? AND deleted_at IS NULL`, [now, now, id]);
        await txn.runAsync(`${tombstoneSql('workout_exercises')} WHERE id = ? AND deleted_at IS NULL`, [now, now, id]);
      } else {
        await txn.runAsync('DELETE FROM workout_sets WHERE workout_exercise_id = ?', [id]);
        await txn.runAsync('DELETE FROM workout_exercises WHERE id = ?', [id]);
      }
    }
    for (const id of plan.deleteSetIds) {
      if (done) {
        await txn.runAsync(`${tombstoneSql('workout_sets')} WHERE id = ? AND deleted_at IS NULL`, [now, now, id]);
      } else {
        await txn.runAsync('DELETE FROM workout_sets WHERE id = ?', [id]);
      }
    }
    for (const id of plan.tickSetIds) {
      await txn.runAsync(
        'UPDATE workout_sets SET completed_at = ?, updated_at = ?, synced_at = NULL WHERE id = ? AND deleted_at IS NULL',
        [plan.tickedAt, now, id]
      );
    }
  });
  if (Object.keys(plan.patch).length > 0) await updateWorkout(workoutId, plan.patch);
}

/** Saves a draft: marks it done and ticks its sets with data. 'empty' (nothing changes) when no set has data. */
export async function saveDraft(id: string, now: Date): Promise<'saved' | 'empty'> {
  const w = await getWorkoutWithExercises(id);
  if (!w) return 'empty';
  const plan = planSave(w, now);
  if (!plan.hasData) return 'empty';
  await applyCompletionPlan(id, plan);
  return 'saved';
}

/** Throws a draft away (hard delete of the workout and its children). */
export async function cancelDraft(id: string): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ status: string }>('SELECT status FROM workouts WHERE id = ?', [id]);
  if (!row || row.status !== 'draft') return;
  await discardWorkout(id);
}

/** Hard-deletes drafts with no activity (edits to the draft, its exercises or sets) for more than 7 days before `now`. Returns how many were removed. */
export async function purgeStaleDrafts(now: Date): Promise<number> {
  const db = await getDatabase();
  const cutoff = addDays(now, -DRAFT_MAX_AGE_DAYS).toISOString();
  // Last activity: the newest updated_at of the draft and its sets and exercises.
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT w.id FROM workouts w
      WHERE w.status = 'draft'
        AND MAX(
              w.created_at,
              w.updated_at,
              COALESCE((SELECT MAX(updated_at) FROM workout_sets WHERE workout_id = w.id), ''),
              COALESCE((SELECT MAX(updated_at) FROM workout_exercises WHERE workout_id = w.id), '')
            ) < ?`,
    [cutoff]
  );
  for (const r of rows) await discardWorkout(r.id);
  return rows.length;
}

let cleanupChain: Promise<void> = Promise.resolve();

/** Resolves when queued cleanups have finished (an editor opening the same workout should wait for it). */
export function waitForCleanup(): Promise<void> {
  return cleanupChain;
}

/**
 * Tidies a finished workout after editing: drops sets and exercises that hold no data. Nothing
 * else changes (the workout stays done). Runs one at a time, and skips entries created after the
 * call started so a quick reopen of the workout is not affected.
 */
export function cleanupEmptyEntries(id: string, now: Date): Promise<void> {
  const startedAt = new Date().toISOString();
  const run = cleanupChain.then(() => cleanupNow(id, now, startedAt));
  cleanupChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function cleanupNow(id: string, now: Date, startedAt: string): Promise<void> {
  const w = await getWorkoutWithExercises(id);
  if (!w) return;
  const plan = planSave(w, now);
  if (!plan.hasData) return; // never empty a workout by cleanup; the user deletes it explicitly
  const oldExercise = new Set(w.exercises.filter((e) => e.created_at <= startedAt).map((e) => e.id));
  const oldSet = new Set(w.exercises.flatMap((e) => e.sets).filter((s) => s.created_at <= startedAt).map((s) => s.id));
  const deleteSetIds = plan.deleteSetIds.filter((x) => oldSet.has(x));
  const removeExerciseIds = plan.removeExerciseIds.filter((x) => oldExercise.has(x));
  if (deleteSetIds.length === 0 && removeExerciseIds.length === 0) return;
  await applyCompletionPlan(id, { ...plan, deleteSetIds, removeExerciseIds, tickSetIds: [], patch: {} });
}

// Native Alert flows around finishing and discarding the live session. The rules live in
// session.ts; this file only asks the questions.
import { Alert } from 'react-native';
import { stopRestTimer } from '@/lib/workouts/rest-timer-store';
import { discardActiveWorkout, finishWorkout } from '@/lib/workouts/session';
import { getWorkoutWithExercises } from '@/lib/workouts/db';
import { planFinish } from '@/lib/workouts/completion';

/** 'gone': the workout no longer exists as an active session (already ended); nothing to do. */
export type FlowResult = 'finished' | 'discarded' | 'cancelled' | 'gone';

function ask(title: string, message: string, confirmLabel: string, cancelLabel = 'Cancel', destructive = true): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

/** "Discard this workout?" then discards. */
export async function confirmAndDiscard(id: string): Promise<FlowResult> {
  const ok = await ask('Discard this workout?', 'What you logged is deleted.', 'Discard');
  if (!ok) return 'cancelled';
  await discardActiveWorkout(id);
  return 'discarded';
}

/**
 * Finishes the session, asking when needed. No ticked set: "No completed sets" (offers discard).
 * Sets with values that are not ticked: "Unfinished sets" -> "Discard and finish". `endAt` ends the
 * workout at that time (the stale prompt passes the last ticked set).
 * Callers flush the editor first.
 */
export async function confirmAndFinish(id: string, endAt?: Date): Promise<FlowResult> {
  const first = await finishWorkout(id, { endAt, discardUnticked: false }, new Date());
  if (first === 'finished') return 'finished';
  if (first === 'gone') {
    await stopRestTimer(id);
    return 'gone';
  }
  if (first === 'empty') {
    const discard = await ask(
      'No completed sets',
      'Tick at least one set to finish, or discard this workout.',
      'Discard workout',
      'Keep going'
    );
    return discard ? confirmAndDiscardNoAsk(id) : 'cancelled';
  }
  const w = await getWorkoutWithExercises(id);
  const count = w ? planFinish(w, new Date(), { discardUnticked: true }).filledUntickedSetIds.length : 0;
  const ok = await ask(
    'Unfinished sets',
    `${count} ${count === 1 ? 'set has' : 'sets have'} values but ${count === 1 ? 'isn’t' : 'aren’t'} ticked. Finishing discards ${count === 1 ? 'it' : 'them'}.`,
    'Discard and finish'
  );
  if (!ok) return 'cancelled';
  const second = await finishWorkout(id, { endAt, discardUnticked: true }, new Date());
  if (second === 'gone') {
    await stopRestTimer(id);
    return 'gone';
  }
  return second === 'finished' ? 'finished' : 'cancelled';
}

async function confirmAndDiscardNoAsk(id: string): Promise<FlowResult> {
  await discardActiveWorkout(id);
  return 'discarded';
}

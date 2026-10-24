import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { useActiveWorkout } from '@/hooks/useActiveWorkout';
import { getActiveWorkoutState } from '@/lib/workouts/active-workout-store';
import { getWorkoutWithExercises } from '@/lib/workouts/db';
import { commitPendingEdits } from '@/lib/workouts/pending-edits';
import { confirmAndDiscard, confirmAndFinish, type FlowResult } from '@/lib/workouts/finish-flow';
import { isStale, lastActivityAt, staleMessage, STALE_AFTER_MS } from '@/lib/workouts/session';

/**
 * Asks "Still training?" when the active workout has had no ticked set for 6 h. Checked on launch
 * (once the active workout is read) and when the app returns to the foreground. "Keep going"
 * silences the prompt for that workout for another 6 h. Mounted once in the root layout.
 */
export function useStaleSessionPrompt(): void {
  const { workout, loaded } = useActiveWorkout();
  const showing = useRef(false);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);
  const snoozedUntil = useRef<Record<string, number>>({});

  const check = useCallback(async () => {
    if (showing.current) return;
    // Claimed before the first await so two triggers never open two alerts.
    showing.current = true;
    let alertOpen = false;
    try {
      const active = getActiveWorkoutState().workout;
      if (!active || pathnameRef.current === '/workout/session') return;
      const now = new Date();
      if ((snoozedUntil.current[active.id] ?? 0) > now.getTime()) return;
      const tree = await getWorkoutWithExercises(active.id);
      if (!tree || tree.status !== 'active' || !isStale(tree, now)) return;
      if (pathnameRef.current === '/workout/session') return;

      const id = active.id;
      const last = lastActivityAt(tree);
      const hasTicked = tree.exercises.some((e) => e.sets.some((s) => s.completed_at));
      const done = () => {
        showing.current = false;
      };
      const snooze = () => {
        snoozedUntil.current[id] = Date.now() + STALE_AFTER_MS;
      };
      const settle = (p: Promise<FlowResult>) =>
        p
          .then((r) => {
            if (r === 'cancelled') snooze();
          })
          .catch(() => snooze())
          .finally(done);
      const keepGoing = { text: 'Keep going', onPress: () => { snooze(); done(); } };
      const discard = {
        text: 'Discard workout',
        style: 'destructive' as const,
        onPress: () => {
          commitPendingEdits();
          settle(confirmAndDiscard(id));
        },
      };
      const finish = {
        text: 'Finish at last set',
        onPress: () => {
          commitPendingEdits();
          settle(confirmAndFinish(id, last));
        },
      };
      alertOpen = true;
      Alert.alert(
        'Still training?',
        staleMessage(tree, now, hasTicked ? last : null),
        hasTicked ? [finish, keepGoing, discard] : [keepGoing, discard],
        { cancelable: false }
      );
    } catch {
      // Nothing to prompt about.
    } finally {
      if (!alertOpen) showing.current = false;
    }
  }, []);

  useEffect(() => {
    if (loaded && workout) void check();
  }, [loaded, workout, check]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check();
    });
    return () => sub.remove();
  }, [check]);
}

// The local "Rest over" notification: one DATE-trigger notification per workout, replaced when the
// rest is adjusted and cancelled on skip, un-tick, finish, discard and sign-out wipe. Native only
// (a no-op on web). Never throws; calls are serialised so a schedule and a cancel cannot interleave.
// A missing permission just means no notification: the in-app timer still runs.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { restNotificationBody } from '@/lib/workouts/rest-timer';

/** Identifier prefix for the notifications this module owns: `rest-timer:<workoutId>`. */
export const REST_TIMER_PREFIX = 'rest-timer:';
export const REST_TIMER_CHANNEL = 'rest-timer';

const isNative = () => Platform.OS !== 'web';

export function restNotificationId(workoutId: string): string {
  return `${REST_TIMER_PREFIX}${workoutId}`;
}

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>, fallback: T, label: string): Promise<T> {
  const next = queue.then(task).catch((error) => {
    console.error(label, error);
    return fallback;
  });
  queue = next;
  return next;
}

let asked = false;

/** Test helper: forget that the permission prompt was shown. */
export function resetRestNotificationState(): void {
  asked = false;
  queue = Promise.resolve();
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(REST_TIMER_CHANNEL, {
    name: 'Rest timer',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });
}

/**
 * True when notifications are allowed. With `prompt`, asks once while the permission is still
 * undetermined (never again after a denial, and never twice per launch). Never throws.
 */
export async function ensureRestPermission(prompt: boolean): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await ensureChannel();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const undetermined =
      (current as { status?: string }).status !== undefined
        ? (current as { status?: string }).status === 'undetermined'
        : current.canAskAgain;
    if (!prompt || asked || !undetermined || !current.canAskAgain) return false;
    asked = true;
    const next = await Notifications.requestPermissionsAsync();
    return next.granted;
  } catch (error) {
    console.error('Failed to check rest notification permission:', error);
    return false;
  }
}

/**
 * Schedules (or replaces) the rest-over notification for `endsAt`. `prompt` allows the first
 * permission request (set when a rest starts; unset when re-arming after a restart).
 * Resolves true when a notification was scheduled.
 */
export function scheduleRestNotification(
  workoutId: string,
  endsAt: number,
  exerciseName: string | undefined,
  options: { prompt: boolean; now?: number } = { prompt: false }
): Promise<boolean> {
  if (!isNative()) return Promise.resolve(false);
  const now = options.now ?? Date.now();
  return enqueue(
    async () => {
      const id = restNotificationId(workoutId);
      await Notifications.cancelScheduledNotificationAsync(id);
      if (endsAt <= now) return false;
      const wallBefore = Date.now();
      if (!(await ensureRestPermission(options.prompt))) return false;
      // The permission prompt can take a while: re-check that the rest has not already ended.
      if (endsAt <= now + (Date.now() - wallBefore)) return false;
      await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: { title: 'Rest over', body: restNotificationBody(exerciseName), sound: true },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(endsAt),
          channelId: REST_TIMER_CHANNEL,
        },
      });
      return true;
    },
    false,
    'Failed to schedule rest notification:'
  );
}

/** Cancels the rest notification of one workout. */
export function cancelRestNotification(workoutId: string): Promise<void> {
  if (!isNative()) return Promise.resolve();
  return enqueue(
    () => Notifications.cancelScheduledNotificationAsync(restNotificationId(workoutId)),
    undefined,
    'Failed to cancel rest notification:'
  );
}

/** Cancels every rest notification (wipe, or a stored timer that no longer applies). */
export function cancelAllRestNotifications(): Promise<void> {
  if (!isNative()) return Promise.resolve();
  return enqueue(
    async () => {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const n of scheduled) {
        if (n.identifier.startsWith(REST_TIMER_PREFIX)) {
          await Notifications.cancelScheduledNotificationAsync(n.identifier);
        }
      }
    },
    undefined,
    'Failed to cancel rest notifications:'
  );
}

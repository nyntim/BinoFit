import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getMealDefinitions, getMealNames } from '@/lib/database';
import { nameForDate, parseReminderTime } from '@/lib/meals';
import { format } from 'date-fns';
import type { MealDefinition, MealNameEntry } from '@/lib/types';

/** Identifier prefix for the notifications this module owns. */
export const REMINDER_PREFIX = 'meal-reminder:';
export const REMINDER_CHANNEL = 'meal-reminders';

const isNative = () => Platform.OS !== 'web';

let handlerSet = false;

/** Shows reminders as a banner while the app is open. No sound or badge. */
export function configureNotificationHandler(): void {
  if (!isNative() || handlerSet) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
    name: 'Meal reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Asks for notification permission. Resolves true when granted. Never throws. */
export async function requestReminderPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await ensureChannel();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const next = await Notifications.requestPermissionsAsync();
    return next.granted;
  } catch (error) {
    console.error('Failed to request notification permission:', error);
    return false;
  }
}

/**
 * Replaces all scheduled meal reminders with one daily reminder per meal that has a
 * reminder_time. Other notifications are left alone. Idempotent; never throws; does not
 * prompt for permission (without it, reminders are cleared but not scheduled).
 */
async function run(defs: MealDefinition[], names: MealNameEntry[], today: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.identifier.startsWith(REMINDER_PREFIX)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }

  const wanted = defs.filter((d) => parseReminderTime(d.reminder_time));
  if (wanted.length === 0) return;

  const perms = await Notifications.getPermissionsAsync();
  if (!perms.granted) return;

  await ensureChannel();
  for (const def of wanted) {
    const time = parseReminderTime(def.reminder_time)!;
    const name = nameForDate(names, def.id, today);
    await Notifications.scheduleNotificationAsync({
      identifier: `${REMINDER_PREFIX}${def.id}`,
      content: { title: name, body: `Time to log ${name}.`, sound: false },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: time.hour,
        minute: time.minute,
        channelId: REMINDER_CHANNEL,
      },
    });
  }
}

// Calls are serialised so an app-start sync and a save cannot interleave.
let queue: Promise<void> = Promise.resolve();

export function syncMealReminders(
  defs: MealDefinition[],
  names: MealNameEntry[],
  today: string = format(new Date(), 'yyyy-MM-dd')
): Promise<void> {
  if (!isNative()) return Promise.resolve();
  queue = queue
    .then(() => run(defs, names, today))
    .catch((error) => console.error('Failed to sync meal reminders:', error));
  return queue;
}

/** Reads meals from SQLite and syncs their reminders. Fire-and-forget; never throws. */
export async function restoreMealReminders(): Promise<void> {
  if (!isNative()) return;
  try {
    const [defs, names] = await Promise.all([getMealDefinitions(), getMealNames()]);
    await syncMealReminders(defs, names);
  } catch (error) {
    console.error('Failed to restore meal reminders:', error);
  }
}

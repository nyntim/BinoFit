import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export type ReminderPermission = 'not-determined' | 'granted' | 'provisional' | 'denied' | 'unavailable';
export function deriveReminderPermission(permission: { granted: boolean; status?: string; canAskAgain: boolean; ios?: { status: number } }): ReminderPermission {
  if (permission.ios && permission.ios.status === Notifications.IosAuthorizationStatus?.PROVISIONAL) return 'provisional';
  if (permission.granted) return 'granted';
  if (permission.status === 'undetermined') return 'not-determined';
  return 'denied';
}
/** Read-only: opening Settings never prompts. */
export async function getReminderPermission(): Promise<ReminderPermission> {
  if (Platform.OS === 'web') return 'unavailable';
  try { return deriveReminderPermission(await Notifications.getPermissionsAsync()); }
  catch { return 'unavailable'; }
}
export const canDeliverReminders = (status: ReminderPermission) => status === 'granted' || status === 'provisional';

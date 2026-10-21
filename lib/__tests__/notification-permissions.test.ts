import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { deriveReminderPermission, getReminderPermission, canDeliverReminders } from '@/lib/notification-permissions';

it('distinguishes unknown, denied and allowed permissions', () => {
  expect(deriveReminderPermission({ granted: false, canAskAgain: true, status: 'undetermined' })).toBe('not-determined');
  expect(deriveReminderPermission({ granted: false, canAskAgain: false, status: 'denied' })).toBe('denied');
  expect(deriveReminderPermission({ granted: true, canAskAgain: true })).toBe('granted');
});
it('recognizes quiet provisional delivery', () => {
  Object.assign(Notifications, { IosAuthorizationStatus: { PROVISIONAL: 3 } });
  expect(deriveReminderPermission({ granted: false, canAskAgain: true, ios: { status: 3 } })).toBe('provisional');
  expect(canDeliverReminders('provisional')).toBe(true);
  expect(canDeliverReminders('denied')).toBe(false);
});
it('reads without prompting and handles unavailable platforms and native errors', async () => {
  Platform.OS = 'ios';
  expect(await getReminderPermission()).toBe('granted');
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  (Notifications.getPermissionsAsync as jest.Mock).mockRejectedValueOnce(new Error('native unavailable'));
  expect(await getReminderPermission()).toBe('unavailable');
  Platform.OS = 'web';
  expect(await getReminderPermission()).toBe('unavailable');
  Platform.OS = 'ios';
});

import type { MealDefinition, MealNameEntry } from '@/lib/types';

let Notifications: typeof import('expo-notifications');
let reminders: typeof import('@/lib/reminders');
let RN: typeof import('react-native');

const def = (id: string, reminder_time: string | null, position = 0): MealDefinition => ({
  id,
  position,
  calorie_target: null,
  protein_target: null,
  carb_target: null,
  fat_target: null,
  reminder_time,
  created_at: '',
  updated_at: '',
});
const name = (meal_id: string, n: string, effective_from = '0000-01-01'): MealNameEntry => ({
  meal_id,
  name: n,
  effective_from,
  updated_at: '',
});

const TODAY = '2026-06-01';

beforeEach(() => {
  jest.resetModules();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  Notifications = require('expo-notifications');
  RN = require('react-native');
  RN.Platform.OS = 'ios';
  reminders = require('@/lib/reminders');
});

afterEach(() => jest.restoreAllMocks());

const scheduled = () =>
  (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.map((c) => c[0]);

describe('syncMealReminders', () => {
  it('uses numbered and renamed labels while retaining the legacy reminder identifier', async () => {
    const breakfast = def('breakfast', '07:00');
    await reminders.syncMealReminders([breakfast], [name('breakfast', 'Meal 1')], TODAY);
    expect(scheduled()[0]).toMatchObject({
      identifier: 'meal-reminder:breakfast',
      content: { title: 'Meal 1', body: 'Time to log Meal 1.' },
    });
    await reminders.syncMealReminders(
      [breakfast], [name('breakfast', 'Meal 1'), name('breakfast', 'Morning', '2026-05-01')], TODAY
    );
    expect(scheduled()[1]).toMatchObject({
      identifier: 'meal-reminder:breakfast',
      content: { title: 'Morning', body: 'Time to log Morning.' },
    });
  });
  it('schedules one daily notification per meal with a reminder, using the current name', async () => {
    await reminders.syncMealReminders(
      [def('a', '12:30'), def('b', null, 1), def('c', '07:05', 2)],
      [name('a', 'Lunch'), name('a', 'Midday', '2026-05-01'), name('b', 'Dinner'), name('c', 'Breakfast')],
      TODAY
    );
    const calls = scheduled();
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      identifier: 'meal-reminder:a',
      content: { title: 'Midday', body: 'Time to log Midday.' },
      trigger: { type: 'daily', hour: 12, minute: 30, channelId: 'meal-reminders' },
    });
    expect(calls[1].identifier).toBe('meal-reminder:c');
    expect(calls[1].trigger).toMatchObject({ hour: 7, minute: 5 });
  });

  it('cancels stale meal reminders but leaves other notifications alone', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      { identifier: 'meal-reminder:old' },
      { identifier: 'meal-reminder:a' },
      { identifier: 'something-else' },
    ]);
    await reminders.syncMealReminders([def('a', '12:30')], [name('a', 'Lunch')], TODAY);
    const cancelled = (Notifications.cancelScheduledNotificationAsync as jest.Mock).mock.calls.map(
      (c) => c[0]
    );
    // 'a' is kept and replaced in place by scheduling with the same identifier.
    expect(cancelled).toEqual(['meal-reminder:old']);
    expect(scheduled()).toHaveLength(1);
    expect(scheduled()[0].identifier).toBe('meal-reminder:a');
  });

  it('cancels existing reminders when permission was revoked', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: true });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      { identifier: 'meal-reminder:a' },
    ]);
    await reminders.syncMealReminders([def('a', '12:30')], [name('a', 'Lunch')], TODAY);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('meal-reminder:a');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('clears reminders when none are set', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      { identifier: 'meal-reminder:a' },
    ]);
    await reminders.syncMealReminders([def('a', null)], [name('a', 'Lunch')], TODAY);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('meal-reminder:a');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('does not schedule or prompt without permission', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
      canAskAgain: false,
    });
    await reminders.syncMealReminders([def('a', '12:30')], [name('a', 'Lunch')], TODAY);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('creates the Android channel before scheduling', async () => {
    RN.Platform.OS = 'android';
    await reminders.syncMealReminders([def('a', '12:30')], [name('a', 'Lunch')], TODAY);
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      'meal-reminders',
      expect.objectContaining({ name: 'Meal reminders' })
    );
  });

  it('is a no-op on web', async () => {
    RN.Platform.OS = 'web';
    await reminders.syncMealReminders([def('a', '12:30')], [name('a', 'Lunch')], TODAY);
    expect(Notifications.getAllScheduledNotificationsAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('swallows errors and keeps working afterwards', async () => {
    (Notifications.scheduleNotificationAsync as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    await expect(
      reminders.syncMealReminders([def('a', '12:30')], [name('a', 'Lunch')], TODAY)
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
    await reminders.syncMealReminders([def('a', '12:30')], [name('a', 'Lunch')], TODAY);
    expect(scheduled()).toHaveLength(2);
  });
});

describe('requestReminderPermission', () => {
  it('returns true when already granted without prompting', async () => {
    expect(await reminders.requestReminderPermission()).toBe(true);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('prompts when undetermined and returns the result', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
      canAskAgain: true,
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
    expect(await reminders.requestReminderPermission()).toBe(false);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('coalesces concurrent permission callers into the same OS request and result', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: true });
    let started!: () => void;
    const requestStarted = new Promise<void>((resolve) => { started = resolve; });
    let finish!: (result: { granted: boolean }) => void;
    (Notifications.requestPermissionsAsync as jest.Mock).mockImplementationOnce(() => {
      started();
      return new Promise((resolve) => { finish = resolve; });
    });
    const first = reminders.requestReminderPermission();
    const second = reminders.requestReminderPermission();
    expect(second).toBe(first);
    await requestStarted;
    expect(Notifications.getPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    finish({ granted: true });
    expect(await Promise.all([first, second])).toEqual([true, true]);
  });

  it.each(['denied', 'failed'])('permits retry after a shared permission request is %s', async (outcome) => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: true });
    const request = Notifications.requestPermissionsAsync as jest.Mock;
    if (outcome === 'failed') request.mockRejectedValueOnce(new Error('native failed'));
    else request.mockResolvedValueOnce({ granted: false });
    expect(await Promise.all([reminders.requestReminderPermission(), reminders.requestReminderPermission()])).toEqual([false, false]);
    request.mockResolvedValueOnce({ granted: true });
    expect(await reminders.requestReminderPermission()).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not prompt again once denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
      canAskAgain: false,
    });
    expect(await reminders.requestReminderPermission()).toBe(false);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('restoreMealReminders', () => {
  it('reads meals only when its turn in the queue comes, so it never applies stale data', async () => {
    // '@/lib/database' re-exports through read-only getters, so spy on the defining module;
    // reminders still imports from '@/lib/database', which reads through to these spies.
    const db = require('@/lib/database-meals');
    const getDefs = jest.spyOn(db, 'getMealDefinitions').mockResolvedValue([def('a', '08:00')]);
    jest.spyOn(db, 'getMealNames').mockResolvedValue([name('a', 'Breakfast')]);

    let release!: () => void;
    (Notifications.getPermissionsAsync as jest.Mock).mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({ granted: true, canAskAgain: true })))
    );
    const first = reminders.syncMealReminders([def('a', '07:00')], [name('a', 'Breakfast')], TODAY);
    const restore = reminders.restoreMealReminders();
    await Promise.resolve();
    expect(getDefs).not.toHaveBeenCalled();

    release();
    await first;
    await restore;
    expect(getDefs).toHaveBeenCalledTimes(1);
    expect(scheduled().map((c) => c.trigger.hour)).toEqual([7, 8]);
  });
});

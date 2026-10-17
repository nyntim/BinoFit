let AsyncStorage: any;
let Notifications: typeof import('expo-notifications');
let RN: typeof import('react-native');
let notif: typeof import('@/lib/workouts/rest-notifications');
let store: typeof import('@/lib/workouts/rest-timer-store');

const NOW = 1_000_000;
const sched = () => (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.map((c) => c[0]);
const cancels = () => (Notifications.cancelScheduledNotificationAsync as jest.Mock).mock.calls.map((c) => c[0]);
const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};

beforeEach(async () => {
  jest.resetModules();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  Notifications = require('expo-notifications');
  RN = require('react-native');
  RN.Platform.OS = 'ios';
  AsyncStorage = require('@react-native-async-storage/async-storage');
  await AsyncStorage.clear();
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true, canAskAgain: true });
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  notif = require('@/lib/workouts/rest-notifications');
  store = require('@/lib/workouts/rest-timer-store');
  jest.clearAllMocks();
});
afterEach(() => jest.restoreAllMocks());

describe('scheduleRestNotification', () => {
  it('schedules rest-timer:<workoutId> with a DATE trigger at endsAt', async () => {
    expect(await notif.scheduleRestNotification('w1', NOW + 60_000, 'Bench', { prompt: true, now: NOW })).toBe(true);
    expect(sched()).toHaveLength(1);
    const n = sched()[0];
    expect(n.identifier).toBe('rest-timer:w1');
    expect(n.trigger.type).toBe('date');
    expect(n.trigger.date).toEqual(new Date(NOW + 60_000));
    expect(n.content.body).toBe('Next set: Bench.');
  });

  it('cancels the previous notification before scheduling (replace)', async () => {
    await notif.scheduleRestNotification('w1', NOW + 60_000, undefined, { prompt: false, now: NOW });
    expect(cancels()).toEqual(['rest-timer:w1']);
    expect(sched()[0].content.body).toBe('Next set.');
  });

  it('does not schedule an end time in the past', async () => {
    expect(await notif.scheduleRestNotification('w1', NOW - 1, 'x', { prompt: true, now: NOW })).toBe(false);
    expect(sched()).toHaveLength(0);
  });

  it('is a no-op on web', async () => {
    RN.Platform.OS = 'web';
    expect(await notif.scheduleRestNotification('w1', NOW + 1000, 'x', { prompt: true, now: NOW })).toBe(false);
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('never throws when scheduling fails', async () => {
    (Notifications.scheduleNotificationAsync as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    await expect(notif.scheduleRestNotification('w1', NOW + 1000, 'x', { prompt: true, now: NOW })).resolves.toBe(false);
  });
});

describe('permission', () => {
  const denied = (canAskAgain: boolean, status: string) =>
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain, status });

  it('no permission: nothing is scheduled', async () => {
    denied(false, 'denied');
    expect(await notif.scheduleRestNotification('w1', NOW + 1000, 'x', { prompt: true, now: NOW })).toBe(false);
    expect(sched()).toHaveLength(0);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('prompts when undetermined and schedules once granted', async () => {
    denied(true, 'undetermined');
    expect(await notif.scheduleRestNotification('w1', NOW + 1000, 'x', { prompt: true, now: NOW })).toBe(true);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('prompts only once even if still undetermined afterwards', async () => {
    denied(true, 'undetermined');
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
    await notif.scheduleRestNotification('w1', NOW + 1000, 'x', { prompt: true, now: NOW });
    await notif.scheduleRestNotification('w1', NOW + 2000, 'x', { prompt: true, now: NOW });
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(sched()).toHaveLength(0);
  });

  it('does not prompt when prompt is false (re-arm after restart)', async () => {
    denied(true, 'undetermined');
    await notif.scheduleRestNotification('w1', NOW + 1000, 'x', { prompt: false, now: NOW });
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('does not prompt after a denial (status denied, even if canAskAgain)', async () => {
    denied(true, 'denied');
    await notif.ensureRestPermission(true);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('resetRestNotificationState allows a new prompt', async () => {
    denied(true, 'undetermined');
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
    await notif.ensureRestPermission(true);
    notif.resetRestNotificationState();
    await notif.ensureRestPermission(true);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(2);
  });
});

describe('cancel', () => {
  it('cancelRestNotification cancels by id', async () => {
    await notif.cancelRestNotification('w1');
    expect(cancels()).toEqual(['rest-timer:w1']);
  });

  it('cancelAllRestNotifications cancels only rest-timer:* ones', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      { identifier: 'rest-timer:a' },
      { identifier: 'meal-reminder:b' },
      { identifier: 'rest-timer:c' },
    ]);
    await notif.cancelAllRestNotifications();
    expect(cancels()).toEqual(['rest-timer:a', 'rest-timer:c']);
  });
});

describe('foreground handler', () => {
  it('hides banner and list for rest-timer:* but not meal-reminder:*', async () => {
    require('@/lib/reminders').configureNotificationHandler();
    const handler = (Notifications.setNotificationHandler as jest.Mock).mock.calls[0][0];
    const rest = await handler.handleNotification({ request: { identifier: 'rest-timer:w1' } });
    expect(rest).toMatchObject({ shouldShowBanner: false, shouldShowList: false });
    const meal = await handler.handleNotification({ request: { identifier: 'meal-reminder:breakfast' } });
    expect(meal).toMatchObject({ shouldShowBanner: true, shouldShowList: true });
  });
});

describe('rest-timer-store', () => {
  const start = (extra = {}, now = NOW) =>
    store.startRestTimer({ workoutId: 'w1', durationSeconds: 60, exerciseName: 'Bench', ...extra }, now);
  const stored = async () => JSON.parse((await AsyncStorage.getItem('active_rest_timer')) ?? 'null');

  beforeEach(() => store.resetRestTimerStore());

  it('start persists to AsyncStorage, notifies subscribers and schedules', async () => {
    const l = jest.fn();
    store.subscribeRestTimer(l);
    const t = start();
    await flush();
    expect(l).toHaveBeenCalledTimes(1);
    expect(store.getRestTimerState().timer).toEqual(t);
    expect(await stored()).toEqual(t);
    expect(sched()[0].identifier).toBe('rest-timer:w1');
    expect(sched()[0].trigger.date).toEqual(new Date(NOW + 60_000));
  });

  it('unsubscribe stops notifications and a throwing listener does not break others', () => {
    const bad = jest.fn(() => {
      throw new Error('x');
    });
    const ok = jest.fn();
    store.subscribeRestTimer(bad);
    const off = store.subscribeRestTimer(ok);
    start();
    expect(ok).toHaveBeenCalledTimes(1);
    off();
    start();
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('start with 0 seconds ends the running timer and cancels its notification', async () => {
    start();
    expect(start({ durationSeconds: 0 })).toBeNull();
    await flush();
    expect(store.getRestTimerState().timer).toBeNull();
    expect(await stored()).toBeNull();
    expect(cancels()).toContain('rest-timer:w1');
  });

  it('adjust replaces the notification (cancel + schedule at the new end)', async () => {
    start();
    await flush();
    jest.clearAllMocks();
    store.adjustRestTimer(15, NOW + 1000);
    await flush();
    expect(store.getRestTimerState().timer?.endsAt).toBe(NOW + 75_000);
    expect(cancels()).toEqual(['rest-timer:w1']);
    expect(sched()).toHaveLength(1);
    expect(sched()[0].trigger.date).toEqual(new Date(NOW + 75_000));
    expect((await stored()).endsAt).toBe(NOW + 75_000);
  });

  it('adjust -15 under 15 s left ends the timer, clears storage and cancels', async () => {
    start({ durationSeconds: 20 });
    await flush();
    jest.clearAllMocks();
    store.adjustRestTimer(-15, NOW + 10_000);
    await flush();
    expect(store.getRestTimerState().timer).toBeNull();
    expect(await stored()).toBeNull();
    expect(sched()).toHaveLength(0);
    expect(cancels()).toEqual(['rest-timer:w1']);
  });

  it('adjust with no timer does nothing', async () => {
    store.adjustRestTimer(15, NOW);
    await flush();
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('adjust does not prompt for permission', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: true, status: 'undetermined' });
    start();
    await flush();
    notif.resetRestNotificationState();
    jest.clearAllMocks();
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: true, status: 'undetermined' });
    store.adjustRestTimer(15, NOW + 1000);
    await flush();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('no permission: the timer still runs but nothing is scheduled', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: false, status: 'denied' });
    const t = start();
    await flush();
    expect(store.getRestTimerState().timer).toEqual(t);
    expect(sched()).toHaveLength(0);
  });

  it('stopRestTimer (skip / untick / finish / discard) clears state, storage and cancels', async () => {
    start();
    await flush();
    jest.clearAllMocks();
    await store.stopRestTimer('w1');
    expect(store.getRestTimerState().timer).toBeNull();
    expect(await stored()).toBeNull();
    expect(cancels()).toEqual(['rest-timer:w1']);
  });

  it('stopRestTimer for another workout leaves the running timer alone', async () => {
    const t = start();
    await store.stopRestTimer('w2');
    expect(store.getRestTimerState().timer).toEqual(t);
    expect(cancels()).toContain('rest-timer:w2');
  });

  it('stopRestTimer without id uses the running timer workout', async () => {
    start();
    await flush();
    jest.clearAllMocks();
    await store.stopRestTimer();
    expect(cancels()).toEqual(['rest-timer:w1']);
    expect(store.getRestTimerState().timer).toBeNull();
  });

  it('expireRestTimer clears state and storage without cancelling', async () => {
    start();
    await flush();
    jest.clearAllMocks();
    store.expireRestTimer();
    await flush();
    expect(store.getRestTimerState().timer).toBeNull();
    expect(await stored()).toBeNull();
    expect(cancels()).toEqual([]);
  });

  it('clearRestTimerAndNotifications clears state, storage and every rest notification', async () => {
    start();
    await flush();
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      { identifier: 'rest-timer:w1' },
      { identifier: 'meal-reminder:x' },
    ]);
    jest.clearAllMocks();
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      { identifier: 'rest-timer:w1' },
      { identifier: 'meal-reminder:x' },
    ]);
    await store.clearRestTimerAndNotifications();
    expect(store.getRestTimerState().timer).toBeNull();
    expect(await stored()).toBeNull();
    expect(cancels()).toEqual(['rest-timer:w1']);
  });

  describe('restoreRestTimer', () => {
    const seed = (over = {}) =>
      AsyncStorage.setItem(
        'active_rest_timer',
        JSON.stringify({ workoutId: 'w1', endsAt: NOW + 60_000, durationSeconds: 60, exerciseName: 'Bench', ...over })
      );

    it('survives a restart: resumes and re-arms the notification without prompting', async () => {
      await seed();
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: true, status: 'undetermined' });
      await store.restoreRestTimer('w1', NOW + 1000);
      await flush();
      expect(store.getRestTimerState().timer?.endsAt).toBe(NOW + 60_000);
      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    });

    it('re-arms the notification when permitted', async () => {
      await seed();
      await store.restoreRestTimer('w1', NOW + 1000);
      await flush();
      expect(sched()[0].identifier).toBe('rest-timer:w1');
    });

    it('clears an expired timer', async () => {
      await seed();
      await store.restoreRestTimer('w1', NOW + 61_000);
      expect(store.getRestTimerState().timer).toBeNull();
      expect(await stored()).toBeNull();
    });

    it('clears a timer of another workout and cancels rest notifications', async () => {
      await seed();
      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([{ identifier: 'rest-timer:w1' }]);
      await store.restoreRestTimer('w2', NOW);
      expect(store.getRestTimerState().timer).toBeNull();
      expect(await stored()).toBeNull();
      expect(cancels()).toEqual(['rest-timer:w1']);
    });

    it('with nothing stored does not throw and leaves no timer', async () => {
      await expect(store.restoreRestTimer('w1', NOW)).resolves.toBeUndefined();
      expect(store.getRestTimerState().timer).toBeNull();
    });
  });
});

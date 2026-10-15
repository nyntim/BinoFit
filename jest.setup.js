// Global mocks: tests must never touch native modules or the network.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('react-native-health', () => ({
  __esModule: true,
  default: { initHealthKit: jest.fn(), Constants: { Permissions: {} } },
}));

jest.mock('@/lib/supabase', () => {
  const builder = {};
  ['from', 'select', 'upsert', 'insert', 'delete', 'eq', 'or', 'not', 'limit', 'single'].forEach(
    (m) => (builder[m] = jest.fn(() => builder))
  );
  builder.then = (resolve) => resolve({ data: null, error: null });
  return { supabase: builder };
});

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
}));

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: jest.fn(() => `uuid-${++n}`) };
});

// expo-sqlite is mocked by default with inert fns; individual tests override it.
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
  importDatabaseFromAssetAsync: jest.fn(),
}));

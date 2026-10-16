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
  ['from', 'select', 'upsert', 'insert', 'delete', 'eq', 'or', 'not', 'limit', 'single', 'in', 'order', 'range'].forEach(
    (m) => (builder[m] = jest.fn(() => builder))
  );
  builder.then = (resolve) => resolve({ data: null, error: null });
  builder.rpc = jest.fn(async () => ({ data: null, error: null }));
  builder.auth = {
    getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
    signInAnonymously: jest.fn(async () => ({ data: { session: null, user: null }, error: null })),
    signInWithIdToken: jest.fn(async () => ({ data: { session: null, user: null }, error: null })),
    signOut: jest.fn(async () => ({ error: null })),
    getUser: jest.fn(async () => ({ data: { user: {} }, error: null })),
    updateUser: jest.fn(async () => ({ data: { user: {} }, error: null })),
    refreshSession: jest.fn(async () => ({ data: { session: null }, error: null })),
    verifyOtp: jest.fn(async () => ({ data: { session: null, user: null }, error: null })),
    signInWithPassword: jest.fn(async () => ({ data: { session: null, user: null }, error: null })),
    resend: jest.fn(async () => ({ data: {}, error: null })),
    resetPasswordForEmail: jest.fn(async () => ({ data: {}, error: null })),
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    startAutoRefresh: jest.fn(async () => {}),
    stopAutoRefresh: jest.fn(async () => {}),
  };
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
  return {
    randomUUID: jest.fn(() => `uuid-${++n}`),
    digestStringAsync: jest.fn(async (_alg, value) => `sha256(${value})`),
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  };
});

jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
    getItemAsync: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    setItemAsync: jest.fn(async (k, v) => {
      store.set(k, v);
    }),
    deleteItemAsync: jest.fn(async (k) => {
      store.delete(k);
    }),
  };
});

jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(async () => ({ identityToken: 'apple-id-token' })),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  AppleAuthenticationButtonType: { SIGN_IN: 0 },
  AppleAuthenticationButtonStyle: { WHITE: 0, BLACK: 2 },
  AppleAuthenticationButton: 'AppleAuthenticationButton',
}));

// expo-sqlite is mocked by default with inert fns; individual tests override it.
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
  importDatabaseFromAssetAsync: jest.fn(),
}));

jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js')
);

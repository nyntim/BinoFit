/* eslint-disable @typescript-eslint/no-require-imports */
// Modules are re-required per test so the in-memory id cache starts empty.
function load() {
  const AsyncStorage = (m => m.default ?? m)(require('@react-native-async-storage/async-storage'));
  const Crypto = require('expo-crypto');
  const { getDeviceId } = require('@/lib/device-id');
  return { AsyncStorage, Crypto, getDeviceId } as {
    AsyncStorage: typeof import('@react-native-async-storage/async-storage').default;
    Crypto: { randomUUID: jest.Mock };
    getDeviceId: () => Promise<string>;
  };
}

beforeEach(() => {
  jest.resetModules();
});

describe('getDeviceId', () => {
  it('concurrent callers on empty storage share one id and persist once', async () => {
    const { AsyncStorage, Crypto, getDeviceId } = load();
    await AsyncStorage.clear();
    const setSpy = jest.spyOn(AsyncStorage, 'setItem');
    const ids = await Promise.all([1, 2, 3, 4, 5].map(() => getDeviceId()));
    expect(new Set(ids).size).toBe(1);
    expect(setSpy.mock.calls.filter(([k]) => k === 'device_id')).toHaveLength(1);
    expect(Crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem('device_id')).toBe(ids[0]);
  });

  it('returns the stored id', async () => {
    const { AsyncStorage, getDeviceId } = load();
    await AsyncStorage.setItem('device_id', 'stored-1');
    expect(await getDeviceId()).toBe('stored-1');
  });
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const DEVICE_ID_KEY = 'device_id';

let _cachedDeviceId: string | null = null;
let _inFlight: Promise<string> | null = null;

async function loadOrCreate(): Promise<string> {
  const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (stored) return stored;

  const newId = Crypto.randomUUID();
  await AsyncStorage.setItem(DEVICE_ID_KEY, newId);
  return newId;
}

export async function getDeviceId(): Promise<string> {
  if (_cachedDeviceId) return _cachedDeviceId;

  // Concurrent callers on an empty cache share one lookup so only one id is ever created.
  if (!_inFlight) {
    _inFlight = loadOrCreate()
      .then((id) => {
        _cachedDeviceId = id;
        return id;
      })
      .finally(() => {
        _inFlight = null;
      });
  }
  return _inFlight;
}

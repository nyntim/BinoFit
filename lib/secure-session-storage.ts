import * as SecureStore from 'expo-secure-store';

// SecureStore warns above 2048 bytes per value and a Supabase session is larger, so values
// are split across several keys. 680 UTF-16 units is at most 2040 bytes even at 3 bytes each.
export const CHUNK_SIZE = 680;

export function splitIntoChunks(value: string, size: number = CHUNK_SIZE): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += size) chunks.push(value.slice(i, i + size));
  return chunks.length > 0 ? chunks : [''];
}

const countKey = (key: string) => `${key}.n`;
const chunkKey = (key: string, i: number) => `${key}.${i}`;
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

async function removeChunks(key: string): Promise<void> {
  const raw = await SecureStore.getItemAsync(countKey(key), OPTIONS);
  const n = raw ? parseInt(raw, 10) : 0;
  for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(chunkKey(key, i), OPTIONS);
  await SecureStore.deleteItemAsync(countKey(key), OPTIONS);
}

/** Storage adapter for Supabase auth, backed by the iOS Keychain / Android Keystore. */
export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const raw = await SecureStore.getItemAsync(countKey(key), OPTIONS);
    if (!raw) return null;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i), OPTIONS);
      if (part === null) return null; // torn write: treat as no session
      parts.push(part);
    }
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const chunks = splitIntoChunks(value);
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(chunkKey(key, i), chunks[i], OPTIONS);
    }
    // Written last, so a reader never sees a count that outruns its chunks.
    const previous = await SecureStore.getItemAsync(countKey(key), OPTIONS);
    await SecureStore.setItemAsync(countKey(key), String(chunks.length), OPTIONS);
    const prevN = previous ? parseInt(previous, 10) : 0;
    for (let i = chunks.length; i < prevN; i++) {
      await SecureStore.deleteItemAsync(chunkKey(key, i), OPTIONS);
    }
  },
  async removeItem(key: string): Promise<void> {
    await removeChunks(key);
  },
};

import * as SecureStore from 'expo-secure-store';
import { CHUNK_SIZE, secureSessionStorage, splitIntoChunks } from '@/lib/secure-session-storage';

const keys = () => (SecureStore.setItemAsync as jest.Mock).mock.calls.map((c) => c[0] as string);
let n = 0;
const freshKey = () => `sb-test-${++n}-auth-token`;

describe('splitIntoChunks', () => {
  it('splits into chunks no longer than the size and rejoins losslessly', () => {
    const value = 'x'.repeat(CHUNK_SIZE * 2 + 5);
    const chunks = splitIntoChunks(value);
    expect(chunks).toHaveLength(3);
    expect(chunks.every((c) => c.length <= CHUNK_SIZE)).toBe(true);
    expect(chunks.join('')).toBe(value);
  });

  it('returns a single empty chunk for an empty string', () => {
    expect(splitIntoChunks('')).toEqual(['']);
  });

  it('keeps worst-case 3-byte characters under the 2048 byte limit', () => {
    const chunk = splitIntoChunks('€'.repeat(3000))[0];
    expect(Buffer.byteLength(chunk, 'utf8')).toBeLessThan(2048);
  });
});

describe('secureSessionStorage', () => {
  it('round-trips a value larger than 2048 bytes', async () => {
    const key = freshKey();
    const value = JSON.stringify({ token: 'a'.repeat(5000), user: { id: 'u1' } });
    await secureSessionStorage.setItem(key, value);
    expect(await secureSessionStorage.getItem(key)).toBe(value);
    const stored = (SecureStore.setItemAsync as jest.Mock).mock.calls.filter((c) => String(c[0]).startsWith(key));
    expect(stored.every((c) => Buffer.byteLength(c[1] as string, 'utf8') <= 2048)).toBe(true);
  });

  it('returns null for a key that was never written', async () => {
    expect(await secureSessionStorage.getItem(freshKey())).toBeNull();
  });

  it('rewriting with fewer chunks removes the stale chunks', async () => {
    const key = freshKey();
    await secureSessionStorage.setItem(key, 'y'.repeat(CHUNK_SIZE * 3));
    await secureSessionStorage.setItem(key, 'short');
    expect(await secureSessionStorage.getItem(key)).toBe('short');
    expect(await SecureStore.getItemAsync(`${key}.1`)).toBeNull();
    expect(await SecureStore.getItemAsync(`${key}.2`)).toBeNull();
    expect(await SecureStore.getItemAsync(`${key}.n`)).toBe('1');
  });

  it('writes the chunk count after every chunk', async () => {
    const key = freshKey();
    (SecureStore.setItemAsync as jest.Mock).mockClear();
    await secureSessionStorage.setItem(key, 'z'.repeat(CHUNK_SIZE * 2));
    const order = keys().filter((k) => k.startsWith(key));
    expect(order[order.length - 1]).toBe(`${key}.n`);
  });

  it('removeItem clears every chunk and the count', async () => {
    const key = freshKey();
    await secureSessionStorage.setItem(key, 'q'.repeat(CHUNK_SIZE * 3));
    await secureSessionStorage.removeItem(key);
    expect(await secureSessionStorage.getItem(key)).toBeNull();
    for (const suffix of ['n', '0', '1', '2']) {
      expect(await SecureStore.getItemAsync(`${key}.${suffix}`)).toBeNull();
    }
  });

  it('treats a torn write (missing chunk) as no session', async () => {
    const key = freshKey();
    await secureSessionStorage.setItem(key, 'w'.repeat(CHUNK_SIZE * 2));
    await SecureStore.deleteItemAsync(`${key}.1`);
    expect(await secureSessionStorage.getItem(key)).toBeNull();
  });
});

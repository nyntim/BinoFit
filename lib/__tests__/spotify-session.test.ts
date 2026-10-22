import * as SecureStore from 'expo-secure-store';

const mockPostToken = jest.fn();
let mockConfigured = true;
jest.mock('@/lib/spotify/api', () => ({ postToken: (...a: unknown[]) => mockPostToken(...a) }));
jest.mock('@/lib/spotify/config', () => ({
  ...jest.requireActual('@/lib/spotify/config'),
  isSpotifyConfigured: () => mockConfigured,
  SPOTIFY_CLIENT_ID: 'cid',
}));

import * as store from '@/lib/spotify/session-store';

const stored = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 3_600_000, scope: 's', ...over });

beforeEach(async () => {
  mockConfigured = true;
  mockPostToken.mockReset();
  store.resetSpotifySessionForTests();
  await store.clearSpotifySession();
  store.resetSpotifySessionForTests();
});

describe('spotify session store', () => {
  it('returns the stored token when fresh', async () => {
    const { secureSessionStorage } = require('@/lib/secure-session-storage');
    await secureSessionStorage.setItem('spotify.session', stored());
    expect(await store.getValidAccessToken()).toBe('a');
    expect(store.getSpotifyState().status).toBe('connected');
    expect(mockPostToken).not.toHaveBeenCalled();
  });

  it('two concurrent calls refresh once', async () => {
    const { secureSessionStorage } = require('@/lib/secure-session-storage');
    await secureSessionStorage.setItem('spotify.session', stored({ expiresAt: 0 }));
    mockPostToken.mockResolvedValue({ status: 200, json: { access_token: 'new', expires_in: 3600 } });
    const [x, y] = await Promise.all([store.getValidAccessToken(), store.getValidAccessToken()]);
    expect([x, y]).toEqual(['new', 'new']);
    expect(mockPostToken).toHaveBeenCalledTimes(1);
  });

  it('a revoked refresh clears the Keychain and reports reconnect', async () => {
    const { secureSessionStorage } = require('@/lib/secure-session-storage');
    await secureSessionStorage.setItem('spotify.session', stored({ expiresAt: 0 }));
    mockPostToken.mockResolvedValue({ status: 400, json: { error: 'invalid_grant' } });
    expect(await store.getValidAccessToken()).toBeNull();
    expect(store.getSpotifyState().status).toBe('reconnect');
    expect(await secureSessionStorage.getItem('spotify.session')).toBeNull();
  });

  it('a network failure keeps the tokens', async () => {
    const { secureSessionStorage } = require('@/lib/secure-session-storage');
    await secureSessionStorage.setItem('spotify.session', stored({ expiresAt: 0 }));
    mockPostToken.mockResolvedValue({ status: 0, json: null });
    expect(await store.getValidAccessToken()).toBeNull();
    expect(store.getSpotifyState().status).toBe('connected');
    expect(await secureSessionStorage.getItem('spotify.session')).not.toBeNull();
  });

  it('clearSpotifySession removes every chunk', async () => {
    const { secureSessionStorage } = require('@/lib/secure-session-storage');
    await secureSessionStorage.setItem('spotify.session', stored({ scope: 'x'.repeat(2000) }));
    expect(await SecureStore.getItemAsync('spotify.session.1')).not.toBeNull();
    await store.clearSpotifySession();
    for (const k of ['spotify.session.n', 'spotify.session.0', 'spotify.session.1', 'spotify.session.2']) {
      expect(await SecureStore.getItemAsync(k)).toBeNull();
    }
    expect(store.getSpotifyState().status).toBe('disconnected');
  });

  it('reports unconfigured without a client id and never calls the network', async () => {
    mockConfigured = false;
    await store.loadSpotifySession();
    expect(store.getSpotifyState().status).toBe('unconfigured');
    expect(await store.getValidAccessToken({ force: true })).toBeNull();
    expect(mockPostToken).not.toHaveBeenCalled();
  });
});

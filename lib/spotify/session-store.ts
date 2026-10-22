// Pub/sub store for the Spotify connection. Tokens live only in the Keychain (secureSessionStorage),
// never in AsyncStorage and never synced. Nothing here throws.
import { secureSessionStorage } from '@/lib/secure-session-storage';
import { postToken } from '@/lib/spotify/api';
import { isSpotifyConfigured, SPOTIFY_CLIENT_ID, SPOTIFY_SESSION_KEY } from '@/lib/spotify/config';
import {
  classifyTokenFailure,
  needsRefresh,
  parseStoredTokens,
  tokenFromResponse,
  type SpotifyTokens,
} from '@/lib/spotify/tokens';

export type SpotifyStatus = 'unconfigured' | 'loading' | 'disconnected' | 'connected' | 'reconnect';
export type SpotifySessionState = { status: SpotifyStatus; connecting: boolean };

/** Playlist names looked up this launch (null = Spotify would not tell us). Cleared on disconnect. */
export const playlistNameCache = new Map<string, string | null>();

let state: SpotifySessionState = { status: 'loading', connecting: false };
let tokens: SpotifyTokens | null = null;
let loading: Promise<void> | null = null;
let refreshing: Promise<string | null> | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function set(patch: Partial<SpotifySessionState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      // keep other listeners running
    }
  });
}

export function getSpotifyState(): SpotifySessionState {
  return state;
}

export function subscribeSpotify(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setSpotifyConnecting(connecting: boolean): void {
  set({ connecting });
}

/** Loads the saved session once. */
export function loadSpotifySession(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      if (!isSpotifyConfigured()) {
        set({ status: 'unconfigured' });
        return;
      }
      try {
        tokens = parseStoredTokens(await secureSessionStorage.getItem(SPOTIFY_SESSION_KEY));
      } catch {
        tokens = null;
      }
      set({ status: tokens ? 'connected' : 'disconnected' });
    })();
  }
  return loading;
}

export async function saveTokens(next: SpotifyTokens): Promise<boolean> {
  try {
    await secureSessionStorage.setItem(SPOTIFY_SESSION_KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  tokens = next;
  loading ??= Promise.resolve();
  set({ status: 'connected' });
  return true;
}

async function removeStored(): Promise<boolean> {
  try {
    await secureSessionStorage.removeItem(SPOTIFY_SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Forgets the session. Throws if the Keychain entry could not be removed, so a wipe can report it. */
export async function clearSpotifySession(): Promise<void> {
  generation += 1;
  tokens = null;
  refreshing = null;
  playlistNameCache.clear();
  const removed = await removeStored();
  set({ status: isSpotifyConfigured() ? 'disconnected' : 'unconfigured', connecting: false });
  if (!removed) throw new Error('Could not remove the Spotify session from the Keychain');
}

export const disconnectSpotify = clearSpotifySession;

async function refresh(current: SpotifyTokens): Promise<string | null> {
  const started = generation;
  const res = await postToken({
    grant_type: 'refresh_token',
    refresh_token: current.refreshToken,
    client_id: SPOTIFY_CLIENT_ID,
  });
  if (started !== generation) return null;
  if (res.status === 200) {
    const next = tokenFromResponse(res.json, Date.now(), current);
    if (!next) return null;
    return (await saveTokens(next)) ? next.accessToken : null;
  }
  if (classifyTokenFailure(res.status, res.json) === 'revoked') {
    tokens = null;
    await removeStored();
    set({ status: 'reconnect' });
  }
  return null;
}

/** A usable access token, refreshing (single flight) when due or when `force` is set. Null when unavailable. */
export async function getValidAccessToken(opts: { force?: boolean } = {}): Promise<string | null> {
  try {
    await loadSpotifySession();
    const current = tokens;
    if (!current || !isSpotifyConfigured()) return null;
    if (!opts.force && !needsRefresh(current, Date.now())) return current.accessToken;
    if (!refreshing) {
      refreshing = refresh(current)
        .catch(() => null)
        .finally(() => {
          refreshing = null;
        });
    }
    return await refreshing;
  } catch {
    return null;
  }
}

/** Test helper. */
export function resetSpotifySessionForTests(): void {
  state = { status: 'loading', connecting: false };
  tokens = null;
  loading = null;
  refreshing = null;
  playlistNameCache.clear();
  listeners.clear();
}

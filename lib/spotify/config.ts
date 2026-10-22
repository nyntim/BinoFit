// Spotify Web API settings. PKCE needs no client secret; never add one to the app.
export const SPOTIFY_CLIENT_ID: string = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ?? '';

export function isSpotifyConfigured(): boolean {
  return SPOTIFY_CLIENT_ID.trim().length > 0;
}

export const SPOTIFY_SCOPES = ['user-read-playback-state', 'playlist-read-private'];
export const SPOTIFY_REDIRECT_PATH = 'spotify-auth';
export const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
export const SPOTIFY_API_URL = 'https://api.spotify.com/v1';
/** Keychain key (through secureSessionStorage). */
export const SPOTIFY_SESSION_KEY = 'spotify.session';

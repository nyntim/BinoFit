// App side of the Spotify sign-in relay (supabase/functions/spotify-callback). Pure.

export const SPOTIFY_RELAY_FUNCTION = 'spotify-callback';

/** The HTTPS redirect URI registered with Spotify, or null when Supabase is not configured. */
export function spotifyRelayUrl(supabaseUrl: string | undefined): string | null {
  const base = supabaseUrl?.trim().replace(/\/+$/, '');
  return base ? `${base}/functions/v1/${SPOTIFY_RELAY_FUNCTION}` : null;
}

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** OAuth `state` carrying the app's return address: `<nonce>.<base64url(encodeURIComponent(url))>`. */
export function encodeRelayState(nonce: string, returnUrl: string): string {
  return `${nonce}.${toBase64Url(encodeURIComponent(returnUrl))}`;
}

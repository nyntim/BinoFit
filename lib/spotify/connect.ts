// Spotify sign-in (Authorization Code with PKCE). Kept apart from session-store so tests of the
// store never load the native auth module.
//
// Spotify redirects to the HTTPS relay (supabase/functions/spotify-callback), which forwards to the
// app's own return address carried in `state`. That address differs between Expo Go, EAS updates
// and real builds, so only the relay URL has to be registered with Spotify.
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { postToken } from '@/lib/spotify/api';
import {
  isSpotifyConfigured,
  SPOTIFY_AUTHORIZE_URL,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_REDIRECT_PATH,
  SPOTIFY_SCOPES,
} from '@/lib/spotify/config';
import { encodeRelayState, spotifyRelayUrl } from '@/lib/spotify/relay';
import { saveTokens, setSpotifyConnecting } from '@/lib/spotify/session-store';
import { tokenFromResponse } from '@/lib/spotify/tokens';

WebBrowser.maybeCompleteAuthSession();

export async function connectSpotify(): Promise<'connected' | 'cancelled' | 'error'> {
  const redirectUri = spotifyRelayUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);
  if (!isSpotifyConfigured() || !redirectUri) return 'error';
  setSpotifyConnecting(true);
  try {
    const returnUrl = AuthSession.makeRedirectUri({ scheme: 'binofit', path: SPOTIFY_REDIRECT_PATH });
    const request = new AuthSession.AuthRequest({
      clientId: SPOTIFY_CLIENT_ID,
      scopes: SPOTIFY_SCOPES,
      redirectUri,
      usePKCE: true,
      responseType: AuthSession.ResponseType.Code,
      state: encodeRelayState(Crypto.randomUUID(), returnUrl),
    });
    const authUrl = await request.makeAuthUrlAsync({ authorizationEndpoint: SPOTIFY_AUTHORIZE_URL });
    const browser = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl);
    if (browser.type === 'cancel' || browser.type === 'dismiss') return 'cancelled';
    if (browser.type !== 'success') return 'error';
    const result = request.parseReturnUrl(browser.url); // rejects a state that is not ours
    if (result.type !== 'success' || !request.codeVerifier) return 'error';
    const res = await postToken({
      grant_type: 'authorization_code',
      code: result.params.code,
      redirect_uri: redirectUri,
      client_id: SPOTIFY_CLIENT_ID,
      code_verifier: request.codeVerifier,
    });
    if (res.status !== 200) return 'error';
    const tokens = tokenFromResponse(res.json, Date.now());
    if (!tokens) return 'error';
    return (await saveTokens(tokens)) ? 'connected' : 'error';
  } catch {
    return 'error';
  } finally {
    setSpotifyConnecting(false);
  }
}

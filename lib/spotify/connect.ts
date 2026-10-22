// Spotify sign-in (Authorization Code with PKCE). Kept apart from session-store so tests of the
// store never load the native auth module.
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { postToken } from '@/lib/spotify/api';
import {
  isSpotifyConfigured,
  SPOTIFY_AUTHORIZE_URL,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_REDIRECT_PATH,
  SPOTIFY_SCOPES,
} from '@/lib/spotify/config';
import { saveTokens, setSpotifyConnecting } from '@/lib/spotify/session-store';
import { tokenFromResponse } from '@/lib/spotify/tokens';

WebBrowser.maybeCompleteAuthSession();

export async function connectSpotify(): Promise<'connected' | 'cancelled' | 'error'> {
  if (!isSpotifyConfigured()) return 'error';
  setSpotifyConnecting(true);
  try {
    const redirectUri = AuthSession.makeRedirectUri({ scheme: 'binofit', path: SPOTIFY_REDIRECT_PATH });
    const request = new AuthSession.AuthRequest({
      clientId: SPOTIFY_CLIENT_ID,
      scopes: SPOTIFY_SCOPES,
      redirectUri,
      usePKCE: true,
      responseType: AuthSession.ResponseType.Code,
    });
    const result = await request.promptAsync({ authorizationEndpoint: SPOTIFY_AUTHORIZE_URL });
    if (result.type === 'cancel' || result.type === 'dismiss') return 'cancelled';
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

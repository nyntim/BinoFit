import { useEffect } from 'react';
import { router } from 'expo-router';

/** Landing for the Spotify OAuth redirect (binofit://spotify-auth). Renders nothing and goes back. */
export default function SpotifyAuthRedirect() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/settings/integrations');
  }, []);
  return null;
}

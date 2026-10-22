import { useEffect, useSyncExternalStore } from 'react';
import { getSpotifyState, loadSpotifySession, subscribeSpotify } from '@/lib/spotify/session-store';

export function useSpotifyConnection() {
  const state = useSyncExternalStore(subscribeSpotify, getSpotifyState, getSpotifyState);
  useEffect(() => {
    void loadSpotifySession();
  }, []);
  return state;
}

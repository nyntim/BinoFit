import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSpotifyConnection } from '@/hooks/useSpotifyConnection';
import { pollNowPlaying, recordNowPlaying, type NowPlayingResult } from '@/lib/spotify/now-playing';
import type { RecordedPlaylist } from '@/lib/spotify/playback';

const POLL_MS = 30_000;

/**
 * Shows what is playing and records the playlist on the live workout. Polls while the screen is
 * focused and the app is active (immediately, every 30 s, and on return to the foreground).
 */
export function useSpotifyNowPlaying(workoutId?: string): NowPlayingResult | null {
  const { status } = useSpotifyConnection();
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );
  const [view, setView] = useState<NowPlayingResult | null>(null);
  const recorded = useRef<RecordedPlaylist | null>(null);
  const enabled = status === 'connected' && !!workoutId && focused;

  useEffect(() => {
    recorded.current = null;
  }, [workoutId]);

  useEffect(() => {
    if (!enabled || !workoutId) {
      setView(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      const np = await pollNowPlaying();
      if (cancelled) return;
      setView(np);
      const next = await recordNowPlaying(workoutId, recorded.current, np);
      if (!cancelled) recorded.current = next;
    };
    const start = () => {
      if (timer) return;
      void tick();
      timer = setInterval(() => void tick(), POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') start();
      else stop();
    });
    return () => {
      cancelled = true;
      stop();
      sub.remove();
    };
  }, [enabled, workoutId]);

  return enabled ? view : null;
}

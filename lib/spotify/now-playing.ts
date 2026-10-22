// Polls Spotify for the current playback and records the playlist on the active workout.
// Best effort: nothing here throws, and nothing blocks the workout.
import { fetchPlaylistName, fetchPlayback } from '@/lib/spotify/api';
import { nextRecordedPlaylist, parsePlayback, type NowPlaying, type RecordedPlaylist } from '@/lib/spotify/playback';
import { getSpotifyState, getValidAccessToken, loadSpotifySession, playlistNameCache } from '@/lib/spotify/session-store';
import { getDatabase } from '@/lib/database';
import { setWorkoutPlaylist } from '@/lib/workouts/db';

export type NowPlayingResult = NowPlaying & { playlistName: string | null };

async function playbackWith(token: string) {
  return fetchPlayback(token);
}

/** One poll. Null when not connected, nothing is playing, or the request failed. */
export async function pollNowPlaying(): Promise<NowPlayingResult | null> {
  try {
    await loadSpotifySession();
    if (getSpotifyState().status !== 'connected') return null;
    let token = await getValidAccessToken();
    if (!token) return null;
    let res = await playbackWith(token);
    if (res.status === 401) {
      token = await getValidAccessToken({ force: true });
      if (!token) return null;
      res = await playbackWith(token);
    }
    const np = parsePlayback(res.status, res.json);
    if (!np) return null;
    let playlistName: string | null = null;
    if (np.playlistId) {
      if (playlistNameCache.has(np.playlistId)) {
        playlistName = playlistNameCache.get(np.playlistId) ?? null;
      } else {
        const fetched = await fetchPlaylistName(token, np.playlistId);
        playlistName = fetched ?? null;
        if (fetched !== undefined) playlistNameCache.set(np.playlistId, fetched);
      }
    }
    return { ...np, playlistName };
  } catch {
    return null;
  }
}

/** Writes the playlist when it changed. Returns the playlist now stored for the workout. */
export async function recordNowPlaying(
  workoutId: string,
  current: RecordedPlaylist | null,
  np: NowPlayingResult | null
): Promise<RecordedPlaylist | null> {
  try {
    const stored = current ?? (await currentPlaylist(workoutId));
    const next = nextRecordedPlaylist(stored, np, np?.playlistName ?? null);
    if (!next) return stored;
    return (await setWorkoutPlaylist(workoutId, next)) ? next : stored;
  } catch {
    return current;
  }
}

async function currentPlaylist(workoutId: string): Promise<RecordedPlaylist | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ playlist_id: string | null; playlist_name: string | null }>(
    'SELECT playlist_id, playlist_name FROM workouts WHERE id = ?',
    [workoutId]
  );
  return row?.playlist_id ? { id: row.playlist_id, name: row.playlist_name } : null;
}

/**
 * Final check at Finish. Gives up after `timeoutMs`; a late result is dropped without writing.
 * No-op when Spotify is not connected. Never throws.
 */
export async function captureFinalPlaylist(workoutId: string, timeoutMs: number): Promise<void> {
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = (async () => {
    await loadSpotifySession();
    if (getSpotifyState().status !== 'connected') return;
    const current = await currentPlaylist(workoutId);
    const np = await pollNowPlaying();
    if (expired) return;
    await recordNowPlaying(workoutId, current, np);
  })().catch(() => {});
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      resolve();
    }, timeoutMs);
  });
  try {
    await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

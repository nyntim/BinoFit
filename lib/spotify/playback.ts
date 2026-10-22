// Pure helpers for what Spotify reports as playing, and which playlist to record. No I/O.
export type NowPlaying = {
  isPlaying: boolean;
  trackName: string;
  artistName: string;
  kind: 'track' | 'episode' | 'other';
  /** Set only when the playback context is a playlist with a valid id. */
  playlistId: string | null;
};

export type RecordedPlaylist = { id: string; name: string | null };

const PLAYLIST_ID = /^[A-Za-z0-9]{1,64}$/;
const NAME_MAX = 200;

export function isValidPlaylistId(id: unknown): id is string {
  return typeof id === 'string' && PLAYLIST_ID.test(id);
}

/** Accepts `spotify:playlist:<id>` and legacy `spotify:user:<u>:playlist:<id>`. */
export function playlistIdFromUri(uri: unknown): string | null {
  if (typeof uri !== 'string') return null;
  const m = /^spotify:(?:user:[^:]+:)?playlist:([^:]+)$/.exec(uri);
  return m && isValidPlaylistId(m[1]) ? m[1] : null;
}

export function playlistUrl(id: string): string {
  return `https://open.spotify.com/playlist/${id}`;
}

export function playlistLabel(name: string | null | undefined): string {
  const t = typeof name === 'string' ? name.trim().slice(0, NAME_MAX) : '';
  return t || 'Spotify playlist';
}

/** Id kept only when valid; the name is kept only with a kept id. Both null otherwise. */
export function cleanPlaylist(id: unknown, name: unknown): { id: string | null; name: string | null } {
  if (!isValidPlaylistId(id)) return { id: null, name: null };
  const n = typeof name === 'string' ? name.trim().slice(0, NAME_MAX) : '';
  return { id, name: n || null };
}

type PlaybackJson = {
  is_playing?: unknown;
  currently_playing_type?: unknown;
  item?: { name?: unknown; artists?: unknown; show?: { name?: unknown } } | null;
  context?: { type?: unknown; uri?: unknown } | null;
};

export function parsePlayback(status: number, json: unknown): NowPlaying | null {
  if (status !== 200 || !json || typeof json !== 'object') return null;
  const j = json as PlaybackJson;
  const item = j.item;
  if (!item || typeof item !== 'object') return null;
  const type = j.currently_playing_type;
  const kind: NowPlaying['kind'] = type === 'track' ? 'track' : type === 'episode' ? 'episode' : 'other';
  const trackName = typeof item.name === 'string' ? item.name : '';
  let artistName = '';
  if (Array.isArray(item.artists)) {
    artistName = item.artists
      .map((a) => (a && typeof a === 'object' && typeof (a as { name?: unknown }).name === 'string' ? (a as { name: string }).name : ''))
      .filter(Boolean)
      .join(', ');
  } else if (item.show && typeof item.show.name === 'string') {
    artistName = item.show.name;
  }
  const ctx = j.context;
  const playlistId = ctx && ctx.type === 'playlist' ? playlistIdFromUri(ctx.uri) : null;
  return { isPlaying: j.is_playing === true, trackName, artistName, kind, playlistId };
}

/**
 * The playlist to store after a poll. A playing playlist replaces the current one; the same id
 * fills a missing name; paused, non-playlist or nothing keeps the current. Null when nothing changes.
 */
export function nextRecordedPlaylist(
  current: RecordedPlaylist | null,
  np: NowPlaying | null,
  nameFor: string | null
): RecordedPlaylist | null {
  if (!np || !np.isPlaying || !np.playlistId) return null;
  if (!current || current.id !== np.playlistId) return { id: np.playlistId, name: nameFor };
  if (!current.name && nameFor) return { id: current.id, name: nameFor };
  return null;
}

import {
  cleanPlaylist,
  isValidPlaylistId,
  nextRecordedPlaylist,
  parsePlayback,
  playlistIdFromUri,
  playlistLabel,
  playlistUrl,
  type NowPlaying,
} from '@/lib/spotify/playback';

const body = (over: Record<string, unknown> = {}) => ({
  is_playing: true,
  currently_playing_type: 'track',
  item: { name: 'Song', artists: [{ name: 'A' }, { name: 'B' }] },
  context: { type: 'playlist', uri: 'spotify:playlist:abc123' },
  ...over,
});

describe('parsePlayback', () => {
  it('returns null for 204, empty body and no item', () => {
    expect(parsePlayback(204, null)).toBeNull();
    expect(parsePlayback(200, null)).toBeNull();
    expect(parsePlayback(200, body({ item: null }))).toBeNull();
    expect(parsePlayback(500, body())).toBeNull();
  });
  it('reads a playlist context', () => {
    expect(parsePlayback(200, body())).toEqual({ isPlaying: true, trackName: 'Song', artistName: 'A, B', kind: 'track', playlistId: 'abc123' });
  });
  it('accepts the legacy user playlist uri', () => {
    expect(parsePlayback(200, body({ context: { type: 'playlist', uri: 'spotify:user:x:playlist:id9' } }))?.playlistId).toBe('id9');
  });
  it.each([
    ['album', { type: 'album', uri: 'spotify:album:abc' }],
    ['artist', { type: 'artist', uri: 'spotify:artist:abc' }],
    ['collection', { type: 'collection', uri: 'spotify:user:x:collection' }],
    ['show', { type: 'show', uri: 'spotify:show:abc' }],
    ['null', null],
  ])('%s context gives no playlist', (_n, context) => {
    expect(parsePlayback(200, body({ context }))?.playlistId).toBeNull();
  });
  it('handles episodes and ads', () => {
    const ep = parsePlayback(200, body({ currently_playing_type: 'episode', item: { name: 'Ep', show: { name: 'Show' } }, context: null }));
    expect(ep).toMatchObject({ kind: 'episode', artistName: 'Show' });
    expect(parsePlayback(200, body({ currently_playing_type: 'ad' }))?.kind).toBe('other');
  });
  it('rejects an invalid playlist id in the uri', () => {
    expect(parsePlayback(200, body({ context: { type: 'playlist', uri: 'spotify:playlist:../x' } }))?.playlistId).toBeNull();
  });
});

describe('ids and labels', () => {
  it('validates ids', () => {
    expect(isValidPlaylistId('abcXYZ019')).toBe(true);
    for (const bad of ['../x', 'a b', 'a'.repeat(65), '', 5, null]) expect(isValidPlaylistId(bad)).toBe(false);
    expect(playlistIdFromUri('spotify:track:abc')).toBeNull();
  });
  it('builds the url', () => {
    expect(playlistUrl('abc')).toBe('https://open.spotify.com/playlist/abc');
  });
  it('labels', () => {
    expect(playlistLabel(null)).toBe('Spotify playlist');
    expect(playlistLabel('   ')).toBe('Spotify playlist');
    expect(playlistLabel(' Lift ')).toBe('Lift');
    expect(playlistLabel('x'.repeat(250))).toHaveLength(200);
  });
  it('cleanPlaylist drops the name when the id is invalid', () => {
    expect(cleanPlaylist('../x', 'Name')).toEqual({ id: null, name: null });
    expect(cleanPlaylist('abc', 5)).toEqual({ id: 'abc', name: null });
    expect(cleanPlaylist('abc', ' N ')).toEqual({ id: 'abc', name: 'N' });
  });
});

describe('nextRecordedPlaylist', () => {
  const np = (over: Partial<NowPlaying> = {}): NowPlaying => ({ isPlaying: true, trackName: 't', artistName: 'a', kind: 'track', playlistId: 'p2', ...over });
  it('a new playing playlist replaces the current', () => {
    expect(nextRecordedPlaylist({ id: 'p1', name: 'One' }, np(), 'Two')).toEqual({ id: 'p2', name: 'Two' });
    expect(nextRecordedPlaylist(null, np(), null)).toEqual({ id: 'p2', name: null });
  });
  it('the same id fills a missing name', () => {
    expect(nextRecordedPlaylist({ id: 'p2', name: null }, np(), 'Two')).toEqual({ id: 'p2', name: 'Two' });
  });
  it('paused, non-playlist and nothing keep the current', () => {
    const cur = { id: 'p1', name: 'One' };
    expect(nextRecordedPlaylist(cur, np({ isPlaying: false }), 'Two')).toBeNull();
    expect(nextRecordedPlaylist(cur, np({ playlistId: null }), null)).toBeNull();
    expect(nextRecordedPlaylist(cur, null, null)).toBeNull();
  });
  it('unchanged returns null', () => {
    expect(nextRecordedPlaylist({ id: 'p2', name: 'Two' }, np(), 'Two')).toBeNull();
  });
});

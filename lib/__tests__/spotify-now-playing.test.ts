import { createMemoryDb } from '@/test-utils/sqlite-memory';

const mockFetchPlayback = jest.fn();
const mockFetchName = jest.fn();
const mockToken = jest.fn();
const mockState = { status: 'connected' };

jest.mock('@/lib/spotify/api', () => ({
  fetchPlayback: (...a: unknown[]) => mockFetchPlayback(...a),
  fetchPlaylistName: (...a: unknown[]) => mockFetchName(...a),
}));
jest.mock('@/lib/spotify/session-store', () => {
  const cache = new Map();
  return {
    playlistNameCache: cache,
    getSpotifyState: () => mockState,
    loadSpotifySession: async () => {},
    getValidAccessToken: (...a: unknown[]) => mockToken(...a),
  };
});

let mem: ReturnType<typeof createMemoryDb>;
let np: typeof import('@/lib/spotify/now-playing');
let w: typeof import('@/lib/workouts/db');
let schema: typeof import('@/lib/workouts/schema');

const playing = (id = 'pl1') => ({
  status: 200,
  json: { is_playing: true, currently_playing_type: 'track', item: { name: 'S', artists: [{ name: 'A' }] }, context: { type: 'playlist', uri: `spotify:playlist:${id}` } },
});
const rowOf = (id: string): any => mem.raw.prepare('SELECT * FROM workouts WHERE id = ?').get(id);

beforeEach(async () => {
  jest.resetModules();
  mockFetchPlayback.mockReset();
  mockFetchName.mockReset().mockResolvedValue('Lift');
  mockToken.mockReset().mockResolvedValue('tok');
  mockState.status = 'connected';
  mem = createMemoryDb();
  const SQLite = require('expo-sqlite');
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  await require('@/lib/database').getDatabase();
  np = require('@/lib/spotify/now-playing');
  w = require('@/lib/workouts/db');
  schema = require('@/lib/workouts/schema');
});

const make = (status: 'active' | 'done' = 'active') =>
  w.createWorkout({ status, date: '2026-06-01', started_at: '2026-06-01T10:00:00.000Z' });

describe('pollNowPlaying', () => {
  it('a 401 forces exactly one refresh and retry', async () => {
    mockFetchPlayback.mockResolvedValueOnce({ status: 401, json: null }).mockResolvedValueOnce(playing());
    const r = await np.pollNowPlaying();
    expect(r?.playlistId).toBe('pl1');
    expect(mockToken).toHaveBeenCalledTimes(2);
    expect(mockToken).toHaveBeenLastCalledWith({ force: true });
    expect(mockFetchPlayback).toHaveBeenCalledTimes(2);
  });
  it('looks the playlist name up once per id', async () => {
    mockFetchPlayback.mockResolvedValue(playing());
    await np.pollNowPlaying();
    const r = await np.pollNowPlaying();
    expect(r?.playlistName).toBe('Lift');
    expect(mockFetchName).toHaveBeenCalledTimes(1);
  });
  it('is a no-op when not connected', async () => {
    mockState.status = 'disconnected';
    expect(await np.pollNowPlaying()).toBeNull();
    expect(mockFetchPlayback).not.toHaveBeenCalled();
  });
});

describe('captureFinalPlaylist', () => {
  it('records the playlist', async () => {
    const wk = await make();
    mockFetchPlayback.mockResolvedValue(playing());
    await np.captureFinalPlaylist(wk.id, 1000);
    expect(rowOf(wk.id)).toMatchObject({ playlist_id: 'pl1', playlist_name: 'Lift' });
  });
  it('resolves within the timeout when fetch hangs and does not write', async () => {
    jest.useFakeTimers();
    try {
      const wk = await make();
      let release: (v: unknown) => void = () => {};
      mockFetchPlayback.mockReturnValue(new Promise((r) => { release = r; }));
      const p = np.captureFinalPlaylist(wk.id, 3000);
      await jest.advanceTimersByTimeAsync(3000);
      await p;
      release(playing());
      await jest.advanceTimersByTimeAsync(10);
      expect(rowOf(wk.id).playlist_id).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
  it('does nothing when not connected', async () => {
    mockState.status = 'disconnected';
    const wk = await make();
    await np.captureFinalPlaylist(wk.id, 1000);
    expect(mockFetchPlayback).not.toHaveBeenCalled();
    expect(rowOf(wk.id).playlist_id).toBeNull();
  });
});

describe('setWorkoutPlaylist', () => {
  it('updates an active row and clears synced_at', async () => {
    const wk = await make();
    mem.raw.prepare('UPDATE workouts SET synced_at = ? WHERE id = ?').run('x', wk.id);
    expect(await w.setWorkoutPlaylist(wk.id, { id: 'p', name: 'N' })).toBe(true);
    expect(rowOf(wk.id)).toMatchObject({ playlist_id: 'p', playlist_name: 'N', synced_at: null });
  });
  it('leaves done and tombstoned rows untouched', async () => {
    const done = await make('done');
    expect(await w.setWorkoutPlaylist(done.id, { id: 'p', name: 'N' })).toBe(false);
    const wk = await make();
    mem.raw.prepare('UPDATE workouts SET deleted_at = ? WHERE id = ?').run('t', wk.id);
    expect(await w.setWorkoutPlaylist(wk.id, { id: 'p', name: 'N' })).toBe(false);
    expect(rowOf(done.id).playlist_id).toBeNull();
  });
});

describe('workouts playlist migration', () => {
  it('adds the columns to an older table once and a second run is a no-op', async () => {
    mem.raw.exec(`
      DROP TABLE workouts;
      CREATE TABLE workouts (id TEXT PRIMARY KEY, status TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'live', name TEXT,
        date TEXT NOT NULL, started_at TEXT, ended_at TEXT, duration_seconds INTEGER, notes TEXT, routine_id TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, synced_at TEXT, deleted_at TEXT);
      INSERT INTO workouts (id,status,date,created_at,updated_at) VALUES ('old','done','2026-01-01','t','t');`);
    await schema.initWorkoutSchema(mem as any);
    await schema.initWorkoutSchema(mem as any);
    const cols = (mem.raw.prepare('PRAGMA table_info(workouts)').all() as any[]).map((c) => c.name);
    expect(cols.filter((c) => c === 'playlist_id')).toHaveLength(1);
    expect(cols).toContain('playlist_name');
    expect(rowOf('old')).toMatchObject({ id: 'old', playlist_id: null });
  });
});

// Thin Spotify Web API calls. Never throw: failures come back as status 0 or null.
import { SPOTIFY_API_URL, SPOTIFY_TOKEN_URL } from '@/lib/spotify/config';

const TIMEOUT_MS = 8000;

async function request(url: string, init: RequestInit): Promise<{ status: number; json: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    let json: unknown = null;
    if (res.status !== 204) {
      try {
        json = await res.json();
      } catch {
        json = null;
      }
    }
    return { status: res.status, json };
  } catch {
    return { status: 0, json: null };
  } finally {
    clearTimeout(timer);
  }
}

export function fetchPlayback(accessToken: string): Promise<{ status: number; json: unknown }> {
  return request(`${SPOTIFY_API_URL}/me/player?additional_types=track,episode`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/** The playlist name; null when Spotify will not tell us (404/403); undefined on a transient failure, so callers retry. */
export async function fetchPlaylistName(accessToken: string, id: string): Promise<string | null | undefined> {
  const { status, json } = await request(`${SPOTIFY_API_URL}/playlists/${encodeURIComponent(id)}?fields=name`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (status === 404 || status === 403) return null;
  if (status !== 200 || !json || typeof json !== 'object') return undefined;
  const name = (json as { name?: unknown }).name;
  return typeof name === 'string' && name.trim() ? name : null;
}

/** Form-encoded POST to the token endpoint. */
export function postToken(body: Record<string, string>): Promise<{ status: number; json: unknown }> {
  return request(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
}

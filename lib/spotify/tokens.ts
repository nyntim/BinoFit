// Pure token rules for the Spotify session. No I/O.
export type SpotifyTokens = {
  accessToken: string;
  refreshToken: string;
  /** epoch ms */
  expiresAt: number;
  scope: string;
};

export type TokenFailure = 'revoked' | 'transient';

/** Builds tokens from a token endpoint response. Keeps the previous refresh token when none is sent. */
export function tokenFromResponse(json: unknown, now: number, previous?: SpotifyTokens | null): SpotifyTokens | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  if (typeof j.access_token !== 'string' || !j.access_token) return null;
  const refreshToken =
    typeof j.refresh_token === 'string' && j.refresh_token ? j.refresh_token : previous?.refreshToken;
  if (!refreshToken) return null;
  const expiresIn = typeof j.expires_in === 'number' && Number.isFinite(j.expires_in) ? j.expires_in : 3600;
  return {
    accessToken: j.access_token,
    refreshToken,
    expiresAt: now + expiresIn * 1000,
    scope: typeof j.scope === 'string' ? j.scope : (previous?.scope ?? ''),
  };
}

export function needsRefresh(tokens: SpotifyTokens, now: number, skewMs = 60_000): boolean {
  return now >= tokens.expiresAt - skewMs;
}

/** 'revoked': the refresh token is dead (user must reconnect). Everything else is retryable. */
export function classifyTokenFailure(status: number, body: unknown): TokenFailure {
  if (status === 401) return 'revoked';
  if (status === 400 && body && typeof body === 'object' && (body as { error?: unknown }).error === 'invalid_grant') {
    return 'revoked';
  }
  return 'transient';
}

export function parseStoredTokens(raw: string | null): SpotifyTokens | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof j.accessToken !== 'string' ||
      typeof j.refreshToken !== 'string' ||
      !j.refreshToken ||
      typeof j.expiresAt !== 'number' ||
      !Number.isFinite(j.expiresAt)
    ) {
      return null;
    }
    return {
      accessToken: j.accessToken,
      refreshToken: j.refreshToken,
      expiresAt: j.expiresAt,
      scope: typeof j.scope === 'string' ? j.scope : '',
    };
  } catch {
    return null;
  }
}

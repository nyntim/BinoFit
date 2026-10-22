import { classifyTokenFailure, needsRefresh, parseStoredTokens, tokenFromResponse, type SpotifyTokens } from '@/lib/spotify/tokens';

const prev: SpotifyTokens = { accessToken: 'old', refreshToken: 'oldr', expiresAt: 0, scope: 's' };

describe('tokenFromResponse', () => {
  it('computes expiry', () => {
    expect(tokenFromResponse({ access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: 'x' }, 1000)).toEqual({
      accessToken: 'a', refreshToken: 'r', expiresAt: 1000 + 3_600_000, scope: 'x',
    });
  });
  it('keeps the previous refresh token when absent, uses the new one when present', () => {
    expect(tokenFromResponse({ access_token: 'a', expires_in: 10 }, 0, prev)?.refreshToken).toBe('oldr');
    expect(tokenFromResponse({ access_token: 'a', refresh_token: 'new', expires_in: 10 }, 0, prev)?.refreshToken).toBe('new');
  });
  it('is null without an access token', () => {
    expect(tokenFromResponse({ refresh_token: 'r' }, 0)).toBeNull();
    expect(tokenFromResponse(null, 0)).toBeNull();
  });
});

describe('needsRefresh', () => {
  const t = { ...prev, expiresAt: 100_000 };
  it('is true exactly at expiresAt minus 60 s and false 1 ms before', () => {
    expect(needsRefresh(t, 40_000)).toBe(true);
    expect(needsRefresh(t, 39_999)).toBe(false);
  });
});

describe('classifyTokenFailure', () => {
  it('classifies', () => {
    expect(classifyTokenFailure(400, { error: 'invalid_grant' })).toBe('revoked');
    expect(classifyTokenFailure(401, null)).toBe('revoked');
    expect(classifyTokenFailure(400, { error: 'other' })).toBe('transient');
    expect(classifyTokenFailure(429, null)).toBe('transient');
    expect(classifyTokenFailure(500, null)).toBe('transient');
    expect(classifyTokenFailure(0, null)).toBe('transient');
  });
});

describe('parseStoredTokens', () => {
  it('rejects bad input', () => {
    expect(parseStoredTokens(null)).toBeNull();
    expect(parseStoredTokens('{nope')).toBeNull();
    expect(parseStoredTokens(JSON.stringify({ accessToken: 'a' }))).toBeNull();
  });
  it('round-trips', () => {
    expect(parseStoredTokens(JSON.stringify(prev))).toEqual(prev);
  });
});

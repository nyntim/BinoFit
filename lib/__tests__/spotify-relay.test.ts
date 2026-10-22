import { encodeRelayState, spotifyRelayUrl } from '@/lib/spotify/relay';
import {
  isAllowedReturnUrl,
  relayLocation,
  returnUrlFromState,
} from '@/supabase/functions/spotify-callback/relay';

const RELAY = 'https://abc.supabase.co/functions/v1/spotify-callback';

function callback(params: Record<string, string>): string {
  return `${RELAY}?${new URLSearchParams(params).toString()}`;
}

describe('spotifyRelayUrl', () => {
  it('builds the function URL and trims a trailing slash', () => {
    expect(spotifyRelayUrl('https://abc.supabase.co/')).toBe(RELAY);
  });

  it('is null without a Supabase URL', () => {
    expect(spotifyRelayUrl(undefined)).toBeNull();
    expect(spotifyRelayUrl('  ')).toBeNull();
  });
});

describe('relay state', () => {
  it.each([
    'binofit://spotify-auth',
    'exp://192.168.1.23:8081/--/spotify-auth',
    'exp://u.expo.dev/085ee170/group/04a08ec9/--/spotify-auth?runtime-version=exposdk%3A57.0.0',
  ])('round-trips %s', (url) => {
    expect(returnUrlFromState(encodeRelayState('nonce-1', url))).toBe(url);
  });

  it('rejects malformed state', () => {
    expect(returnUrlFromState(null)).toBeNull();
    expect(returnUrlFromState('no-dot')).toBeNull();
    expect(returnUrlFromState('.abc')).toBeNull();
    expect(returnUrlFromState('nonce.')).toBeNull();
    expect(returnUrlFromState('nonce.%%%')).toBeNull();
  });
});

describe('isAllowedReturnUrl', () => {
  it('allows only the app schemes', () => {
    expect(isAllowedReturnUrl('binofit://spotify-auth')).toBe(true);
    expect(isAllowedReturnUrl('exp://host/--/spotify-auth')).toBe(true);
    expect(isAllowedReturnUrl('EXPS://host/--/spotify-auth')).toBe(true);
    expect(isAllowedReturnUrl('https://evil.example/steal')).toBe(false);
    expect(isAllowedReturnUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedReturnUrl('spotify-auth')).toBe(false);
  });
});

describe('relayLocation', () => {
  it('forwards code and state to the app address', () => {
    const state = encodeRelayState('n1', 'binofit://spotify-auth');
    const location = relayLocation(callback({ code: 'abc', state, extra: 'dropped' }));
    expect(location).toBe(`binofit://spotify-auth?${new URLSearchParams({ code: 'abc', state }).toString()}`);
  });

  it('appends to an address that already has a query', () => {
    const app = 'exp://u.expo.dev/x/--/spotify-auth?runtime-version=1';
    const location = relayLocation(callback({ code: 'c', state: encodeRelayState('n', app) }));
    expect(location?.startsWith(`${app}&code=c&state=`)).toBe(true);
  });

  it('forwards an error such as access_denied', () => {
    const state = encodeRelayState('n', 'binofit://spotify-auth');
    expect(relayLocation(callback({ error: 'access_denied', state }))).toContain('error=access_denied');
  });

  it('refuses other schemes and missing or broken state', () => {
    expect(relayLocation(callback({ code: 'c', state: encodeRelayState('n', 'https://evil.example') }))).toBeNull();
    expect(relayLocation(callback({ code: 'c' }))).toBeNull();
    expect(relayLocation(callback({ code: 'c', state: 'garbage' }))).toBeNull();
    expect(relayLocation('not a url')).toBeNull();
  });
});

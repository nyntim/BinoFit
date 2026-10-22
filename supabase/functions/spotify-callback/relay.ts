// Pure logic of the Spotify sign-in relay. Plain TypeScript with no Deno or app imports, so Jest
// can test it and the Edge Function can import it.
//
// Spotify only redirects to registered URIs, but the app's own return address differs between
// Expo Go, EAS updates and real builds. The app registers this function's HTTPS URL instead and
// puts its return address in the OAuth `state` as `<nonce>.<base64url(encodeURIComponent(url))>`.
// The function forwards the browser there with the result, and only to the app's own schemes.

const ALLOWED_SCHEMES = ['exp:', 'exps:', 'binofit:'];
const FORWARDED_PARAMS = ['code', 'state', 'error'];

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
}

/** The app return address carried in `state`, or null when the state is malformed. */
export function returnUrlFromState(state: string | null): string | null {
  if (!state) return null;
  const dot = state.indexOf('.');
  if (dot <= 0 || dot === state.length - 1) return null;
  try {
    return decodeURIComponent(fromBase64Url(state.slice(dot + 1)));
  } catch {
    return null;
  }
}

export function isAllowedReturnUrl(url: string): boolean {
  const scheme = /^[a-z][a-z0-9+.-]*:/i.exec(url)?.[0]?.toLowerCase();
  return !!scheme && ALLOWED_SCHEMES.includes(scheme);
}

/** Where to send the browser for a callback request URL, or null when it must be refused. */
export function relayLocation(requestUrl: string): string | null {
  let incoming: URL;
  try {
    incoming = new URL(requestUrl);
  } catch {
    return null;
  }
  const target = returnUrlFromState(incoming.searchParams.get('state'));
  if (!target || !isAllowedReturnUrl(target)) return null;
  const forward = new URLSearchParams();
  for (const key of FORWARDED_PARAMS) {
    const value = incoming.searchParams.get(key);
    if (value !== null) forward.set(key, value);
  }
  return `${target}${target.includes('?') ? '&' : '?'}${forward.toString()}`;
}

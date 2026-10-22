// Spotify OAuth redirect relay (deployed with verify_jwt off: Spotify's browser redirect carries no
// Supabase token). Forwards the sign-in result to the app address in `state`; see relay.ts.
import { relayLocation } from './relay.ts';

Deno.serve((req) => {
  const location = relayLocation(req.url);
  if (!location) {
    return new Response('Invalid Spotify sign-in request.', {
      status: 400,
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
    });
  }
  return new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store' } });
});

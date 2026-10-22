# Integrations

Both are native only and reached from Settings > Integrations.

## Spotify

Workouts record the playlist that was playing: `playlist_name` / `playlist_id` (SQLite via PRAGMA/ALTER in `initWorkoutSchema`, Supabase via the bounded `workouts_playlist_columns` SQL, which must be applied before releasing clients; synced by `syncWorkoutTree`, restored through `cleanPlaylist`). Record and display only: never volume, records, Health or CSV.

`lib/spotify/`:

- `config.ts`: `EXPO_PUBLIC_SPOTIFY_CLIENT_ID`, PKCE, scopes `user-read-playback-state` and `playlist-read-private`, no secret.
- Pure `tokens.ts` and `playback.ts` (`parsePlayback`, `nextRecordedPlaylist`, `cleanPlaylist`, `playlistLabel`, `playlistUrl`).
- `api.ts`: never throws.
- `session-store.ts`: pub/sub; tokens in the Keychain under `spotify.session` via `secureSessionStorage`; single-flight refresh; `invalid_grant` sets `reconnect`; `clearSpotifySession` is called by `finishWipe`.
- `connect.ts`: `expo-auth-session` + `WebBrowser.openAuthSessionAsync`. Spotify's registered redirect is the HTTPS relay Edge Function `supabase/functions/spotify-callback` (deployed with `verify_jwt` off). It reads the app's return address from `state` (`encodeRelayState` in `relay.ts`) and 302s there, only to `exp://`, `exps://` or `binofit://`, so sign-in works in Expo Go, EAS updates and builds alike. The token exchange uses the relay URL as `redirect_uri`. Landing route: `app/spotify-auth.tsx`. `supabase/functions` is excluded from the app tsconfig; `relay.ts` is tested through Jest.
- `now-playing.ts`: `pollNowPlaying`, `recordNowPlaying`, `captureFinalPlaylist`.

Detection: while connected, `useSpotifyNowPlaying` polls `/me/player` every 30 s while the session is focused and the app is active. A playing playlist context replaces the stored one; anything else keeps it. `setWorkoutPlaylist` only updates `active` rows. `confirmAndFinish` without `endAt` does a final check (3 s cap).

UI: `NowPlayingLine` (session, hidden with the keyboard), `PlaylistRow` (finished workout, opens Spotify), a line in `WorkoutHistoryRow`, Settings > Integrations.

## Apple Health (iOS only)

`@/hooks/use-health-kit` and `services/healthKitService.ts`. Settings syncs weight both ways; the app reads steps and active calories and writes eaten nutrition and finished workouts.

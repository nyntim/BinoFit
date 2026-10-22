# Identity and accounts

## Identity

`lib/auth.ts` `initAuth()` (on launch) ensures a session via `signInAnonymously()`, claims legacy device-UUID rows once (`claim_device_data` RPC), redeems any pending merge ticket and triggers a sync.

- `user_id` on all Supabase rows is `getSessionUserId()` (`auth.uid()::text`).
- `lib/device-id.ts` is legacy: read only for the one-time claim.
- Failed anonymous sign-ins are throttled to one per 30 s (`force` bypasses it for user actions). A restored anonymous session is validated once per launch with `getUser()` and replaced if its user is gone.
- Problems are recorded by `lib/auth-debug.ts` (`reportAuthIssue`, `getLastAuthIssue`; console warning in `__DEV__`, shown in Settings > Account in dev).

## Account (email and Apple)

Offered first in onboarding (`app/onboarding/index.tsx`, `app/onboarding/account.tsx`) and in Settings (`components/settings/AccountSection.tsx`, modal `app/account.tsx`). Hook: `useAuth`.

- Shared form `components/auth/AuthForm.tsx` (modes signUp, signIn, resetRequest, resetVerify, changePassword, confirmEmail). Validation and error copy are in `lib/auth-validation.ts`. Navigation after auth is the pure `routeAfterAuth` in `lib/auth-routing.ts`.
- `signUpWithEmail()` converts the anonymous user in place with `updateUser({ email, password })` + `refreshSession()` (same uid: no ticket, merge or restore). With "Confirm email" on it returns `confirmEmail`, and `verifyEmailCode()` finishes with `verifyOtp(type 'email_change')`.
- `signInWithEmail()`, `verifyPasswordReset()` (recovery code) and `signInWithApple()` all go through `signInWithMerge(obtainSession)`: make a merge ticket as the anonymous user, sign in, redeem the ticket (the existing account wins), then `restoreFromAccount()` in `lib/restore.ts`.
- `AuthState.method` is `'apple' | 'email' | null`.

## Restore

`restoreFromAccount()` pulls logs, meals, goals, profile, weight entries, custom foods, workouts and routines. The account replaces local goals, profile and meals; logs are last-write-wins under the tombstone rules in [data-and-sync.md](data-and-sync.md). `hasRestoredData(summary)` (goals, logs, weight entries, workouts or routines; meals alone do not count) decides whether a restore completes onboarding and whether `routeAfterAuth` returns `tabs` or `goals`.

## Sign out

`signOutAndWipe()` (after `prepareSignOut()` and a UI warning) signs out locally, wipes user data (`finishWipe`, which also clears the rest timer and the Spotify session) and starts a new anonymous session. Kept device preferences are listed in [preferences.md](preferences.md).

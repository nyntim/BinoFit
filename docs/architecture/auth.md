# Identity and accounts

## Files

`lib/auth.ts` only re-exports; callers import from `@/lib/auth` so `jest.mock('@/lib/auth')` covers them.

- `lib/auth-session.ts`: `getSession`, `getSessionUserId`, auth state, and helpers the other files share (lazy sync calls, `restoreTracked`).
- `lib/auth-init.ts`: `initAuth`, `ensureSession`, session validation, the legacy claim, merge tickets, `signInWithMerge` and `retryRestore`. `signInWithMerge` lives here because it shares the in-flight flags with `initAuth`; other files read them through `isAccountOperationInFlight()`.
- `lib/auth-apple.ts`: `signInWithApple`.
- `lib/auth-email.ts`: email sign-up, code verification, email sign-in, password reset and change.
- `lib/auth-wipe.ts`: `finishWipe` and resuming an interrupted sign-out or account deletion on launch.
- `lib/auth-sign-out.ts`: `countUnsynced`, `prepareSignOut`, `signOutAndWipe`.
- `lib/auth-account-deletion.ts`: `deleteAccountAndWipe` and the pending-deletion helpers.

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

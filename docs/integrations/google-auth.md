# Google sign-in (Emergent-managed) — Phase 3

**Status: implemented; the full Google OAuth round-trip NOT verified (needs a real Google account, can't be automated). Not verified on device.**

## Required accounts
- None for you: Emergent hosts the Google OAuth client. You don't need a Google Cloud OAuth client ID.

## Env vars
- None. The exchange endpoint is fixed by the Emergent auth playbook.

## Flow
1. The app (`mobile/app/account.tsx`) builds the redirect URL:
   - web: `<origin>/auth-callback`
   - native: `Linking.createURL("auth-callback")`, using the `rushrivals` scheme from app.json.
2. It opens `https://auth.emergentagent.com/?redirect=<encoded redirect>`. On native this uses `WebBrowser.openAuthSessionAsync`; on web it navigates the page.
3. After Google consent, Emergent redirects to `…/auth-callback#session_id=…`.
4. `app/auth-callback.tsx` (web) or the auth-session result (native) passes the `session_id` to `POST /api/v1/auth/google {session_id}`.
5. The backend exchanges the session id at `https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data` (header `X-Session-ID`) and gets back email, name and picture.
6. It upserts the user by email and issues **our own** JWT access + rotating refresh tokens. Guest progress linking then works the same as for email sign-in.

## Child mode
- The Google button and register are hidden. Only the existing-account email sign-in remains, plus "Continue as guest" after a failed attempt.

## Callbacks / webhooks
- The redirect route `/auth-callback`. There are no server webhooks.

## Errors and retry
- If the user closes the browser, the app stays on Account with no change.
- If the exchange fails, the Account screen shows the error and offers "Continue as guest" (JRN-79).
- Rate limit: 10/min/IP.

## Security
- The `session_id` is used once, server-to-server.
- Tokens are never taken from the URL beyond the session id.
- Refresh tokens are stored hashed and rotated.
- Banned accounts get 403.

## Test procedure (manual)
1. Account → Continue with Google → pick an account → you return signed in.
2. Sign out, then repeat: you should land on the same account (matched by email).
3. On Android, check that the `rushrivals://auth-callback` deep link returns to the app.

## Production verification status
- The full round-trip has not been verified in preview or on device.

# Email (Emergent-managed Resend) — password reset (Phase 3)

**Status: implemented; delivery to a real inbox NOT verified from this environment.** Seeded `.test` addresses can't receive mail.

## Required accounts
- None for you: Emergent manages the sending account. No Resend API key is needed.
- `EMERGENT_EMAIL_KEY` is a platform-managed secret; never edit it.

## Env vars (backend/.env)
| Var | Purpose |
|---|---|
| `EMERGENT_EMAIL_KEY` | Managed key for the Emergent email proxy (set by the platform). |
| `EMAIL_FROM_NAME` | Sender display name ("Rush Rivals"). |
| `EXPOSE_RESET_CODE_FOR_TESTS` | **Tests only.** When `1`, `/auth/forgot-password` returns `debug_code`. Never set it in production. |

## Flow (`backend/rr/mailer.py`, `rr/routers/auth.py`)
1. `POST /api/v1/auth/forgot-password {email}` always returns 200, so it can't be used to discover which emails have accounts.
2. If the account exists, the server creates a 6-digit code and stores only its hash. The code is valid for 15 min, can be used once, and allows 5 attempts.
3. The email is sent through the Emergent email proxy, with the playbook guardrail gate.
4. `POST /api/v1/auth/reset-password {email, code, new_password}` sets the new password and revokes all refresh tokens, which signs out every device.

## Callbacks / webhooks
None (no bounce webhooks are configured).

## Errors and retry
- A send failure is logged and the API still returns 200 (no account enumeration).
- The user can request a new code; earlier codes are invalidated.
- Rate limit: 10 requests/min/IP on auth endpoints.

## Security
- Codes are hashed and expire.
- Attempts are capped.
- Reset revokes all refresh tokens.
- No user data is included in the email beyond the code.

## Test procedure
- **Automated:** pytest stubs the mailer (`no_mail` fixture) and checks the code flow.
- **Manual:**
  1. Register with a real inbox address.
  2. Go to Account → Forgot password and enter that address.
  3. Receive the code and set a new password.
  4. Check that the old sessions are signed out.

## Production verification status
- Delivery to a real inbox has not been verified (sender reputation, spam placement).

# Rush Rivals API (Phase 3) — `/api/v1`

FastAPI app in `/app/backend` (`server.py` mounts `rr/main.py`). OpenAPI: **`/api/openapi.json`** (Swagger at `/docs`). Gameplay stays offline-first: guests never call the API.

## Structure
```
rr/core.py        settings, Mongo, error shape, JWT/bcrypt, auth deps (+ require_role for Phase 6 RBAC), rate limiter, idempotency, pagination
rr/economy.py     authoritative wallet: atomic $inc with balance >= 0 guards + append-only ledger
rr/catalog.py     server prices/rewards (mirrors mobile/src/config/catalog.ts), plausibility constants, default remote config
rr/mailer.py      Emergent-managed email (Resend proxy) with the playbook guardrail gate
rr/routers/       auth.py · player.py · runs.py · online.py (leaderboard, events, config, catalog, support, reports, inbox)
migrations/       m0001_init.py (up/down) + runner.py      seed.py (idempotent)
tests/            test_phase3.py (pytest)
```
To add Phase 4 purchase verification, add `rr/routers/store.py`, which grants through `economy.apply` plus `idempotent`. To add Phase 6 admin, add `rr/routers/admin.py` with `Depends(require_role("admin"))`.

## Auth
- **Email/password.** `POST /auth/register {email,password,name?}` returns 201. `POST /auth/login {email,password}`. Both return `{user, access_token, refresh_token, token_type, expires_in}`.
  - Access token: HS256 JWT, 15 min, sent as `Authorization: Bearer <access>`.
  - Refresh token: opaque, 30 days, stored **sha256-hashed**.
- **Refresh.** `POST /auth/refresh {refresh_token}` rotates the token: the old one is revoked. Reusing a revoked token revokes the whole token family. `POST /auth/logout {refresh_token}` revokes it.
- **Google.** `POST /auth/google {session_id}` uses the Emergent-managed Google flow.
  - The app opens `https://auth.emergentagent.com/?redirect=<app>/auth-callback`. The redirect returns `#session_id=…`.
  - The server exchanges the id at `demobackend.emergentagent.com/auth/v1/env/oauth/session-data`, upserts the user by email and issues our tokens.
- **Password reset.**
  - `POST /auth/forgot-password {email}` always returns 200, so it can't be used to discover accounts. It emails a 6-digit code (15 min, single use, hashed, at most 5 attempts) through Emergent email.
  - `POST /auth/reset-password {email,code,new_password}` sets the password and revokes all refresh tokens.
- **Delete account.** `POST /auth/delete-account {confirm:"DELETE"}` hard-deletes the user, tokens, ledger, runs, scores and claims. Support tickets are anonymised.
- **Auth failures.** 401 `unauthorized` / `token_expired` / `invalid_credentials`; 403 `forbidden` / `not_owned` / `banned`.

## Error shape, pagination, rate limits, idempotency
- **Errors.** Every error returns `{"error":{"code","message","details?"}}`. This includes 404/405/422 (`validation_error`) and 500 (`internal_error`).
- **Pagination.** Use `?limit=` (clamped to 1–100) and `?cursor=` (opaque). Responses include `next_cursor`, which is null on the last page.
- **Rate limits.** In-memory sliding 60 s window, per process. Exceeding one returns 429 `rate_limited` with `details.retry_after_s`.
  - Auth: 10/min/IP on register, login, refresh, google, forgot and reset.
  - Gameplay: 30/min/user on runs, purchases, claims, spend and reports.
  - Support tickets: 10/min.
  - Override with the `RATE_LIMIT_AUTH` / `RATE_LIMIT_GAMEPLAY` env vars.
  - Client IP = the `X-Forwarded-For` entry `TRUSTED_PROXY_HOPS` from the right (default 3: client → Cloudflare → load balancer, as measured in preview). Left-hand entries are client-controlled, so spoofing them doesn't bypass the limit. If the production proxy chain differs, adjust `TRUSTED_PROXY_HOPS`.
- **Idempotency.** Every value-granting or spending write requires the `Idempotency-Key` header (8–128 chars).
  - Covered endpoints: purchases, daily, missions, achievements, runs finish/offline, events claim, inbox claim, me/spend.
  - Keys are unique per `(user_id, key)`.
  - A repeat returns the stored result with `replayed:true`. A concurrent duplicate returns 409 `idempotency_in_progress`. Reusing a key for a different operation returns 409 `idempotency_key_reused`.
  - A missing key returns 400 `idempotency_key_required`.

## Endpoints
| Method & path | Auth | Notes |
|---|---|---|
| GET `/config` | – | Remote config: `version, maintenance, min_supported_version, latest_version, store_url, flags{events,leaderboard,shop}`. The app ships safe defaults. |
| GET `/catalog` | – | Server prices, rewards, missions and achievements (`version`). |
| GET `/me` | ✓ | Profile, wallet, inventory, prefs, `server_time`. |
| POST `/me/link {local, choice?}` | ✓ | Links guest progress. See "Linking guest progress" below. |
| GET `/me/ledger` | ✓ | Paginated ledger entries. |
| POST `/purchases {kind: character\|board\|world\|shop, item_id}` | ✓ + key | Atomic ownership claim, then charge. Returns 400 `insufficient_funds` or 409 `already_owned`. |
| POST `/me/spend {sink: revive\|hoverboard, ref}` | ✓ + key | Server-priced sinks. Revive: the server counts revives already paid for that run (`ref` = `revive:<run>:<n>`) and charges 5, then 10; a third returns 400 `revive_limit`. Hoverboard costs 1. |
| POST `/daily/claim` | ✓ + key | Server UTC day; 7-day streak rewards. Returns 409 `already_claimed`. |
| GET `/missions` | ✓ | Daily missions (from validated run stats) plus achievements, with progress. |
| POST `/missions/{id}/claim`, `/achievements/{id}/claim` | ✓ + key | Claim once (unique `claims` index). |
| PUT `/me/preferences {notifications, ad_personalisation}` | ✓ | Notification preferences stored server-side. |
| PUT `/me/equipped {kind,item_id}` | ✓ | Returns 403 `not_owned` if the player doesn't own the item. |
| POST `/runs/start {world}` | ✓ | Returns `{run_id, seed, run_token}`. The token is an HS256 JWT signed with `RUN_TOKEN_SECRET`. |
| POST `/runs/finish {run_id, run_token, seed, duration, distance, coins, score, powerups_used, revives, world, event_tokens}` | ✓ + key | Validated; see "Run validation" below. |
| POST `/runs/offline {run_id, seed, …}` | ✓ + key | Queued offline run: same checks without the server clock. Coins capped at 300, max 20 per day, **never on the leaderboard**. |
| GET `/leaderboard?period=daily\|weekly\|all&limit&cursor` | optional | Best score per player. Banned players excluded. `me` = your rank. |
| POST `/reports {target_user_id, reason: cheating\|offensive_name\|other, note?}` | ✓ | Moderation queue (`reports`). |
| GET `/events` | optional | Active events with `seconds_left`, plus the player's `progress` / `claimed` when signed in. |
| POST `/events/{id}/claim` | ✓ + key | Requires progress ≥ `rule.target`; claim once. |
| POST `/support/tickets {category, message, email?}` | optional | Returns `{ticket_no: "RR-000001"}`. |
| GET `/inbox` | ✓ | Broadcast and personal messages, each with `claimed`. |
| POST `/inbox/{msg_id}/claim` | ✓ + key | Attachment is claim-once on the server, across all of the player's devices. |
| GET `/api/health` | – | Liveness (Phase 1). |

### Linking guest progress (`/me/link`)
- On first link, the device progress is imported.
- If the account already has progress, the endpoint returns 409 `progress_conflict` with `details{cloud,device}`. The client then calls again with `choice: "cloud"` or `choice: "device"`.
- Values are **set, not added**, so neither choice can duplicate currency.

### Run validation (`/runs/finish`)
- **Token checks:** the token must be valid, match the run, user and seed, and be **single-use** (the run moves atomically from `started` to `finished`).
- **Plausibility checks:**
  - `duration ≤ server elapsed + 10 s`.
  - Distance stays under the speed curve `∫ min(8.5 + 0.11t, 26)`, with a ×1.05 margin plus a speed-boost allowance.
  - Coins ≤ 4/s + 15 and ≤ 0.8 × distance + 15.
  - Score is within `[distance + 10·coins, 2·(distance + 10·coins)] ± 1`, since x2 doubles both terms.
  - `event_tokens ≤ coins`.
- **Rejection:** returns 400 `run_invalid` with `details.reasons`.
- **Grants:** the server grants the coins it validated, never client totals. It then updates stats and day stats, adds the score to the leaderboard and records event progress.

## App integration (mobile/src/online)
- **`online.ts`** — the API client.
  - Bearer token with a single in-flight refresh.
  - An **ordered persistent queue**: every op carries its own Idempotency-Key, and the queue flushes on reconnect. Network errors, 5xx and 429 stop the flush and leave the "Cloud sync failed" + Retry banner. Permanent 4xx errors drop the op.
  - Reconciliation: once the queue is empty, the server wallet and inventory overwrite local values.
  - Any sign-out (manual, account deletion or revoked session) resets the local wallet, inventory and equipped items to fresh guest defaults. Cloud-derived currency therefore can't be linked into another account.
- **`AccountProvider.tsx`** — remote config with bundled defaults, the "Synced" toast, guest linking and preference sync.
- **`RemoteConfigGate.tsx`** — Maintenance and Update required screens, and the Update available banner.
- **Screens:** `account`, `auth-callback`, `leaderboard`, `events`, `support`, plus server inbox messages and cloud missions.
- Guests (signed out) take none of these code paths.

---
## Phase 5 — Public website API (`/api/v1/public/*`, no auth)
| Method | Path | Notes |
|---|---|---|
| GET | `/public/catalog` | Characters, boards and worlds from the **published** config, plus power-ups. Each has `{id,name,description,art_url,unlock{type:free|ad|currency,currency,amount,level,label}}`. Disabled items are hidden. |
| GET | `/public/news?limit&cursor` | Published only, newest first. `empty_message` is "No news yet — check back soon" when there are none. |
| GET | `/public/news/{slug}` | 404 `not_found` for drafts or unknown slugs. |
| GET | `/public/faq` | Published FAQ items, ordered. |
| GET | `/public/site-config` | `store_url_android` (null until set in remote config, so the site shows "Coming soon"), `latest_version`, `maintenance`. |
| GET | `/public/sitemap` | Static pages plus published news paths. `disallow: ["/admin"]`. |
| GET | `/public/contact/form-token` | Signed token stamped with the form render time (valid 2 h). |
| POST | `/public/contact` | `{name,email,category: bug|account|purchase|feedback|other, message, website(honeypot), form_token}` → 201 `{ticket_no:"RR-000123", confirmation_email_sent}`. Errors: 422 `validation_error` + `details.fields` ("Enter a valid email", "Message must be at least 10 characters"), 400 `spam_rejected` (honeypot filled or submitted < 3 s after render), 400 `form_expired`, 429 `rate_limited` (5/hour/IP). The confirmation email goes out through Emergent-managed Resend. |
| POST | `/public/data-deletion` | `{email, confirm:true, note?}` → 201 `{request_id}`. 5/hour/IP. Admins see these at `/admin/deletion-requests`. |

**Game art:** served by the backend at `/api/static/game/<file>` (copied into `backend/static/game/` from `mobile/assets/game/`). Re-copy after changing the art.

## Phase 6 — Admin API (`/api/v1/admin/*`, separate realm)
**Auth:** admin accounts live in `admins`, never `users`. Player Bearer tokens are ignored (401).
- Sign-in steps: `POST /admin/auth/login`, then `/admin/auth/totp/enroll` (first time only; returns `secret` and `otpauth_uri` for the QR code), then `/admin/auth/totp/verify`.
- A successful verify sets the HttpOnly cookie `rr_admin_session` (Secure, SameSite=Strict) and returns `csrf_token`. Every unsafe method needs the `X-CSRF-Token` header (403 `csrf_failed` otherwise).
- Lockout: 5 failures in 15 min → 423 `account_locked` for 15 min.
- Sessions expire after 30 min idle or 12 h total (401 `session_expired`).
- `GET /admin/me`, `GET /admin/sessions`, `POST /admin/sessions/{id}/revoke`, `POST /admin/sessions/revoke-all`, `POST /admin/auth/logout`.

**Permissions:** `domain:action` pairs.
- Domains: dashboard, players, economy, reports, catalog, liveops, content, config, release, purchases, tickets, admins, audit.
- Actions: view, edit, publish, approve, refund, enforce, manage_admins.
- A missing permission returns 403 `forbidden`. Each role's permission list is returned by `GET /admin/admins` (`roles`) and by `/admin/me` (`admin.permissions`).

| Role | Grants |
|---|---|
| owner | everything |
| liveops_editor | view + edit: catalog, liveops, config (drafts), release, content |
| publisher | config approve/publish, content edit/publish, view catalog/liveops/release |
| support | players view, economy view/edit (compensation), tickets view/edit, reports view |
| finance | players/economy view, purchases view/refund |
| moderator | players view/enforce, reports view/edit |
| viewer | view-only on every domain except admins/audit |

| Method | Path | Permission |
|---|---|---|
| GET/POST | `/admin/admins` | admins:manage_admins (create `{email,password≥12,name,role}`) |
| PATCH | `/admin/admins/{id}` `{role?,disabled?}` | admins:manage_admins. The last Owner can't be demoted or disabled. |
| POST | `/admin/admins/{id}/reset-mfa` | admins:manage_admins |
| GET | `/admin/dashboard` | dashboard:view. Players total/new_7d/DAU/WAU, runs today, average duration, verified/refunded purchases, ad rewards, open tickets/reports. `crashes.connected=false` ("Connect Firebase to see crashes"), `ads.admob.connected=false`. `revenue_by_currency=null` with an explanation. |
| GET | `/admin/players?q=` · `/admin/players/{id}` | players:view. The detail view includes the ledger, entitlements, purchases (tokens masked `abcd…wxyz`), runs, reports and tickets. Never hashes or tokens. |
| POST | `/admin/players/{id}/compensate` `{coins,gems,hoverboards,reason}` + **Idempotency-Key** | economy:edit. Ledger reason `admin_compensation`. A replay returns the first result. |
| POST | `/admin/players/{id}/enforce` `{action: ban|suspend|unban, reason, confirm:true, days?}` | players:enforce. Banned or suspended players are hidden from leaderboards, their logins return 403, and their refresh tokens are revoked. |
| GET | `/admin/deletion-requests` | players:view |
| GET | `/admin/reports?status=` · PATCH `/admin/reports/{id}` `{status: open|reviewing|actioned|dismissed, note}` | reports:view / reports:edit |
| GET | `/admin/ledger?user_id&reason&date_from&date_to` | economy:view |
| GET | `/admin/catalog` · `/admin/release` · `/admin/config/published` · `/admin/config/versions[/{v}]` · `/admin/config/versions/{v}/diff` | catalog / release / config :view |
| POST | `/admin/config/drafts` `{data?, note}` (no data = copy of published) · PUT `/admin/config/drafts/{v}` | config:edit |
| POST | `/admin/config/versions/{v}/submit` | config:edit |
| POST | `/admin/config/versions/{v}/approve` · `/reject {note}` | config:approve. **Four-eyes:** the author or submitter gets 403 `four_eyes`. |
| POST | `/admin/config/versions/{v}/publish` `{confirm}` | config:publish. Requires `approved` status. Turning maintenance ON needs `confirm:true`. |
| POST | `/admin/config/rollback` `{version, confirm:true}` | config:publish. Republishes an earlier published version's data as a **new** version (`rollback_of`). |
| POST | `/admin/config/quick` `{maintenance?, flags?, confirm:true}` | config:publish. Maintenance and feature-flag toggle, published as a new version (`kind: quick_toggle`). |
| GET/POST | `/admin/news`, `/admin/faq` · PATCH `/{id}` | content:view / content:edit |
| POST | `/admin/news/{id}/publish {inbox?}` · `/unpublish` · `/delete {confirm:true}` (same for faq) | content:publish. `inbox:true` also posts an in-game Inbox announcement. |
| GET | `/admin/purchases?owner&revoked` | purchases:view (tokens masked) |
| POST | `/admin/purchases/{id}/reverify` | purchases:refund. Uses the Play Developer API. Returns 503 `verification_unavailable` until Play is configured. |
| POST | `/admin/purchases/{id}/revoke` `{reason, confirm:true}` | purchases:refund. Entitlements are deactivated and unspent currency is clawed back. |
| GET | `/admin/tickets?status` · `/admin/tickets/{no}` | tickets:view |
| POST | `/admin/tickets/{no}/assign {admin_id}` · `/reply {message}` · `/close` | tickets:edit. A reply goes to the player's Inbox (when the ticket has a user) and is emailed through Resend. |
| GET | `/admin/audit?admin_id&action&q` · `/admin/audit/export.csv` | audit:view (Owner). The export itself is audited. |

**Config document** (`config_versions.data`):
- `remote` — maintenance, min_supported_version, latest_version, store_url, store_url_android, release_notes, flags.
- `catalog` — `{character|board|world: {id: {price: null|"ad"|{currency,amount}, unlock_level, enabled}}}`.
- `missions`, `achievements`, `daily_rewards` (7 entries), `events` — `[{event_id,name,world,description,art,rule,rewards,starts_at,ends_at,enabled}]`.

Publishing applies the config to the running server (prices, missions and daily rewards used by the economy endpoints) and syncs `remote_config` and `events`. **Lifecycle:** draft → pending_approval → approved → published → superseded. Rejected versions are terminal. Published versions are immutable.

**Game app:** `GET /api/v1/catalog` now carries the published `version`, prices, `unlock_levels`, `daily_rewards` and `missions`. `mobile/src/online/liveCatalog.ts` applies these over the bundled tables and caches the last published version. Offline or first launch uses the bundled defaults. Signed-in players see server missions and events. Guests keep the bundled local goals.

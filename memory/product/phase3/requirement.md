# Phase 3 Requirement — Backend, Accounts & Online Services

Version: phase-3. See `../overview.md` (F-21..F-26). Builds on Phase 2 as delivered (Expo app with local economy service, ledger, versioned save v2+, local leaderboard, AdsService/BillingService stubs, shared catalog config src/config/catalog.ts).

## Goal
Add a secure FastAPI + MongoDB backend that gives signed-in players accounts (email+password and Google), cloud save, server-validated rewards, a global leaderboard with anti-abuse, live events, remote config (maintenance, update required) and support tickets — while guest/offline play keeps working unchanged.

## Functional requirements
### Backend foundation
- REQ-106 [always] The backend shall expose a versioned API under /api/v1 with OpenAPI at /api/openapi.json.
- REQ-107 [always] Every error response shall use the shape {error: {code, message, details?}} with correct HTTP status.
- REQ-108 [always] Every write endpoint that grants value shall require an Idempotency-Key header and return the original result for a repeated key.
- REQ-109 [always] List endpoints shall paginate with limit (max 100) and cursor.
- REQ-110 [always] The backend shall rate-limit auth endpoints (10/min/IP) and gameplay submission endpoints (30/min/user) returning 429 with code "rate_limited".
- REQ-111 [always] MongoDB collections shall have JSON-schema validators, unique indexes for idempotency keys/emails/event ids, created_at/updated_at timestamps, and versioned migration scripts in /app/backend/migrations.
- REQ-112 [always] Product/economy configuration shall be served from one backend catalog mirroring src/config/catalog.ts, versioned.
### Accounts (F-21)
- REQ-113 [event] When a player registers with email and password, the system shall create an account with a bcrypt-hashed password and return access + refresh tokens.
- REQ-114 [unwanted] If the email exists or the password is under 8 characters, then the system shall show "Email already registered" or "Password must be at least 8 characters".
- REQ-115 [event] When a player signs in with Google, the system shall use Emergent-managed Google auth and create or link the account.
- REQ-116 [unwanted] If sign-in fails, then the app shall show "Sign-in failed. Check your details and try again." with Retry and "Continue as guest".
- REQ-117 [event] When a guest signs in for the first time, the system shall offer to link the guest's local progress to the account.
- REQ-118 [unwanted] If the account already has cloud progress, then the system shall ask "Keep cloud progress" or "Keep this device's progress" with a summary of each. (interpreted)
- REQ-119 [event] When a player requests password reset, the system shall email a one-time reset code via Emergent-managed Resend, valid 15 minutes.
- REQ-120 [event] When a player signs out, the system shall revoke the refresh token and keep local guest progress usable.
- REQ-121 [event] When a player requests account deletion, the system shall require typed confirmation "DELETE" and delete server data within the request (soft-delete + purge job). (interpreted)
- REQ-122 [state] While a player is under 13 (child mode), the app shall hide account sign-up. (interpreted)
### Cloud save & server economy (F-22, F-23)
- REQ-123 [state] While signed in, the server shall be the authority for currency, inventory, XP, mission and reward claims.
- REQ-124 [event] When a signed-in run ends, the app shall submit a run report {run_id, run_token, seed, duration, distance, coins, score, powerups_used, revives} to the server.
- REQ-125 [always] The server shall issue a signed run_token at run start (online) and validate reports against plausibility rules (max speed × duration, max coin rate, score formula, seed, single use).
- REQ-126 [unwanted] If a run report fails validation, then the server shall reject it with code "run_invalid" and grant nothing.
- REQ-127 [unwanted] If the player was offline at run start, then the app shall queue the report and the server shall validate it with offline rules (capped grants, no leaderboard). (interpreted)
- REQ-128 [always] Purchases with coins/gems, mission claims, daily rewards and achievement claims shall be server endpoints when signed in, each idempotent.
- REQ-129 [event] When the app reconnects, the system shall sync queued operations in order and show "Synced" toast.
- REQ-130 [unwanted] If sync fails, then the system shall show "Cloud sync failed" with Retry while keeping local play available.
- REQ-131 [always] Daily reward and mission day boundaries shall use server time when online.
### Leaderboard & events (F-24)
- REQ-132 [always] The Leaderboard screen shall show Global (Daily, Weekly, All Time tabs) with rank, name, score and the player's own rank highlighted.
- REQ-133 [always] Only server-validated online runs shall enter the leaderboard.
- REQ-134 [unwanted] If a player is flagged/banned, then the server shall exclude their scores.
- REQ-135 [unwanted] If offline or signed out, then the Leaderboard shall show "Sign in and go online to see global rankings" with Sign in button plus local personal bests.
- REQ-136 [always] An Events screen shall list active server-configured events (name, art, time remaining, rules, rewards) with empty state "No events right now".
- REQ-137 [state] While an event is active, the app shall apply its rule (e.g., collect special tokens in a world) and grant its rewards once via server.
- REQ-138 [always] The Friends leaderboard shall not be shown. (social not implemented)
### Remote config & system states (F-25)
- REQ-139 [event] When the app starts online, the system shall fetch remote config (versioned) and fall back to bundled defaults on failure.
- REQ-140 [state] While maintenance mode is on, the app shall show a Maintenance screen for online features with "Play offline" available.
- REQ-141 [unwanted] If the app version is below min_supported_version, then the system shall show a blocking "Update required" screen with "Update now" to the store.
- REQ-142 [unwanted] If the app version is below latest_version, then the system shall show a dismissible "Update available" dialog with "Update now" and "Later".
- REQ-143 [unwanted] If the backend is unreachable or returns 5xx, then the system shall show "Service unavailable" for online features with Retry and offline play intact.
- REQ-144 [always] Remote feature flags shall gate events, leaderboard and shop sections.
### Support (F-26)
- REQ-145 [event] When a player submits "Report a problem" (category, message, optional email), the system shall create a support ticket and show its ticket number.
- REQ-146 [event] When a player reports another player from the leaderboard, the system shall create a moderation report.
- REQ-147 [always] Inbox shall also show server messages (announcements, ticket replies) merged with local messages, attachments claimed once server-side.
- REQ-148 [always] Notification preferences shall be stored on the server for signed-in players.

## Quality requirements
```
Q-15 Tag: Security.Auth
     Scale: protected endpoints reachable without valid token / with another user's token
     Meter: pytest auth matrix over all endpoints
     Must: 0   Plan: 0
Q-16 Tag: Economy.ServerIntegrity
     Scale: duplicate or negative grants under replayed / concurrent requests (50 parallel)
     Meter: pytest concurrency + idempotency
     Must: 0   Plan: 0
Q-17 Tag: Leaderboard.AntiCheat
     Scale: forged run reports accepted (impossible speed, coin rate, reused token, wrong formula)
     Meter: pytest 20 forged cases
     Must: 0   Plan: 0
Q-18 Tag: Sync.Durability
     Scale: offline ops lost after reconnect
     Meter: E2E offline→online with 10 queued ops
     Must: 0   Plan: 0
Q-19 Tag: API.Latency
     Scale: p95 ms for profile/save/leaderboard endpoints
     Meter: 200 requests load script
     Must: 800   Plan: 250
Q-20 Tag: Offline.Resilience
     Scale: gameplay blocked when backend down
     Meter: E2E with backend stopped
     Must: never   Plan: never
```

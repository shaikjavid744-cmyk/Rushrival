# Phase 6 Requirement — Admin & Operations Panel

Version: phase-6. See `../overview.md` (F-31). Builds on Phases 1–5: backend domains (users, wallet/ledger, runs, leaderboard, events, missions, daily rewards, inbox, tickets, reports, remote config, catalog, purchases/entitlements, news/FAQ content). Admin UI at /app/frontend `/admin`, separate auth realm from players.

## Goal
A secure, role-based operations panel to run Rush Rivals live: metrics, player support and enforcement, economy and catalogue, live-ops content, news, remote config with approval and rollback, purchases, tickets, feature flags, maintenance — with every privileged change audited.

## Functional requirements
### Access
- REQ-206 [always] Admin accounts shall be separate from player accounts, created only by an Owner (seeded first Owner from env).
- REQ-207 [event] When an admin signs in with email + password, the system shall require a TOTP code before granting a session.
- REQ-208 [state] While an admin has not enrolled TOTP, the system shall force enrollment (QR + secret + verify) before any other page.
- REQ-209 [unwanted] If the password or TOTP is wrong 5 times in 15 minutes, then the system shall lock the admin for 15 minutes.
- REQ-210 [always] Admin sessions shall be httpOnly secure cookies, expire after 30 minutes idle and 12 hours max, with CSRF protection.
- REQ-211 [always] Permissions shall be granular: view, edit, publish, approve, refund, enforce, manage_admins, per domain; roles Owner, LiveOps Editor, Publisher, Support, Finance, Moderator, Viewer map to permission sets.
- REQ-212 [unwanted] If an admin calls an endpoint without permission, then the server shall return 403 and the UI shall hide/disable that action.
- REQ-213 [always] Admin profile shall show sessions with "Revoke" per session and "Sign out everywhere".
- REQ-214 [always] Owners shall create, edit role, disable admins and reset their MFA.
### Dashboard & insight
- REQ-215 [always] Dashboard shall show verified metrics from the database: DAU/WAU, new players, runs/day, avg run length, purchases count and verified revenue by currency, ad rewards granted, open tickets, open reports, crash count placeholder labelled "Connect Firebase to see crashes". (interpreted)
- REQ-216 [always] Ad performance shall show only in-app ad reward counts and state "AdMob revenue requires AdMob API connection" until configured.
### Players & moderation
- REQ-217 [always] Player search shall find by email, name, or id with paginated results.
- REQ-218 [always] Player detail shall show profile, wallet, ledger (paginated), inventory, entitlements, runs, reports, tickets; purchase tokens masked.
- REQ-219 [event] When a Support admin grants compensation, the system shall require a reason and post an idempotent ledger entry.
- REQ-220 [event] When a Moderator bans/suspends a player, the system shall require a reason and a confirmation dialog, then hide their leaderboard scores.
- REQ-221 [always] Reports queue shall support statuses open → reviewing → actioned/dismissed with notes.
### Economy, catalogue, live-ops
- REQ-222 [always] Admins shall view and filter all transactions (ledger) by player, type, date.
- REQ-223 [always] Catalogue management shall edit characters, boards, worlds, items and store products (prices, unlock rules, enabled) via the draft/publish workflow.
- REQ-224 [always] Missions, achievements, daily reward calendar and events shall be manageable (create, edit, schedule, disable) via draft/publish.
- REQ-225 [always] News and FAQ shall be created, previewed and published/unpublished; published items appear on the website and in-game Inbox announcements optionally.
### Remote config
- REQ-226 [always] Remote config (flags, maintenance, versions, store URLs, economy values, catalogue, live-ops) shall move through Draft → Preview → Approval → Published, with each published version immutable.
- REQ-227 [unwanted] If the approver is the same admin who authored the draft, then the system shall reject the approval. (interpreted: four-eyes)
- REQ-228 [event] When an admin with publish rights rolls back, the system shall republish a selected earlier version as a new version.
- REQ-229 [always] Preview shall show a diff against the current published version.
- REQ-230 [always] Maintenance mode and feature flags shall be toggleable with confirmation and take effect in the app on next config fetch.
### Purchases, tickets, releases
- REQ-231 [always] Purchases page shall list verified purchases, states, entitlements and refunds; Finance can trigger "Re-verify" and "Revoke entitlement" with reason.
- REQ-232 [always] Support tickets (from app and website) shall be listed, assigned, replied to (reply goes to player Inbox and email via Resend), and closed.
- REQ-233 [always] Release page shall show min_supported_version, latest_version, release notes (editable via config workflow).
### Audit & safety
- REQ-234 [always] Every privileged write shall create an immutable audit log entry {admin, action, target, before, after, ip, time}.
- REQ-235 [always] Audit log shall be searchable and exportable as CSV by Owners.
- REQ-236 [always] Destructive actions (ban, revoke, delete, rollback, maintenance on) shall require a typed or explicit confirmation dialog.
- REQ-237 [always] Secrets, full purchase tokens and password hashes shall never be returned by admin APIs.
- REQ-238 [always] /admin shall be noindex and excluded from sitemap.

## Quality requirements
```
Q-31 Tag: Security.AdminAuthZ
     Scale: admin endpoints accessible without required permission / without MFA
     Meter: pytest permission matrix over every admin endpoint × role
     Must: 0   Plan: 0
Q-32 Tag: Audit.Completeness
     Scale: privileged writes without audit entry
     Meter: pytest
     Must: 0   Plan: 0
Q-33 Tag: Config.Safety
     Scale: bad publish not recoverable via rollback within 1 minute
     Meter: E2E
     Must: 0   Plan: 0
Q-34 Tag: Data.Exposure
     Scale: secrets/tokens/hashes in admin responses
     Meter: pytest response scan
     Must: 0   Plan: 0
Q-35 Tag: UX.Ops
     Scale: minutes for a support admin to find a player and grant compensation
     Meter: human
     Must: 3   Plan: 1
```

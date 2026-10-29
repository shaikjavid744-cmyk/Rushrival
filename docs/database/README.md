# Database (MongoDB) — Phase 3

The database is set by `DB_NAME` in `backend/.env` and reached through `MONGO_URL`. Every document carries `created_at`, and mutable documents also carry `updated_at`, both as UTC `datetime`. API responses never include `_id` (projections exclude it).

## Collections, validators and indexes
Validators are `$jsonSchema` with `validationLevel: moderate`.

| Collection | Purpose | Validator highlights | Indexes |
|---|---|---|---|
| `users` | Account, wallet{coins,gems,hoverboards,xp}, inventory, equipped, stats, day_stats, daily, prefs, role, banned | wallet values int ≥ 0 (**no negative balance, even via direct writes**); email pattern; role enum | `user_id` unique, `email` unique |
| `ledger` | Append-only economy log (delta, reason, ref, balance after) | entry_id, user_id, reason required | `entry_id` unique, `(user_id, created_at desc)` |
| `idempotency` | Stored results per `(user_id, key)` | status ∈ pending/done | `(user_id, key)` **unique**; TTL 7 days |
| `refresh_tokens` | sha256 of refresh tokens, family, revoked | revoked bool, expires_at date | `token_hash` unique, `user_id`, TTL on `expires_at` |
| `reset_codes` | Hashed 6-digit codes | used bool | `(user_id, created_at)`, TTL |
| `runs` | Run tokens and reports (online/offline) | status ∈ started/finished/rejected; mode ∈ online/offline | `run_id` unique, `(user_id, mode, day)` |
| `scores` | Leaderboard entries (online validated runs only) | score int ≥ 0 | `(day, score desc)`, `(week, score desc)`, `score desc`, `user_id`, `run_id` unique |
| `claims` | Claim-once rewards (mission/achievement/event/inbox) | kind enum | `(user_id, kind, ref, day)` **unique** |
| `events` | Server-configured events (schedule, world, rule, rewards) | starts_at/ends_at dates | `event_id` unique, `(starts_at, ends_at)` |
| `event_progress` | Per-player best tokens per event | – | `(user_id, event_id)` unique |
| `messages` | Inbox (user_id null = broadcast), attachment | – | `msg_id` unique, `(user_id, created_at)` |
| `tickets` | Support tickets `RR-000001` (sequence held in `counters`) | status enum | `ticket_no` unique |
| `reports` | Player reports (moderation, Phase 6) | – | `report_id` unique, `target_user_id` |
| `remote_config` | `_id: "active"` doc merged over the bundled defaults | – | – |

## Migrations
- **Location:** `backend/migrations/m000N_*.py`. Each file exports `ID`, `async up(db)` and `async down(db)`. Applied IDs are stored in `_migrations`.
- **Running:** the server applies pending migrations at startup. They're idempotent, so a concurrent run is safe. To run them by hand:
  ```
  cd /app/backend
  python -m migrations.runner up        # apply pending
  python -m migrations.runner down 1    # revert the last one
  ```
- **What 0001 does:**
  - `up`: creates or `collMod`s every validator and creates all indexes.
  - `down`: drops those indexes and turns validators off. It never deletes data.
- **Testing:** `tests/test_phase3.py::test_migrations_up_down_up` checks up → up (no-op) → down → up.

## Seed
`python seed.py` is idempotent and creates:
- the test players (see `/app/memory/test_credentials.md`);
- the active demo event **Temple Rush** (`evt_temple_rush`): temple world, reach 50 tokens in one run, reward 25 gems + 2000 coins, active for 60 days from seeding;
- a broadcast inbox gift `msg_welcome_online` (10 gems), plus a server twin of the bundled `welcome` gift;
- the `remote_config` "active" document.

## Operations
- Toggle maintenance:
  ```
  db.remote_config.updateOne({_id:"active"},{$set:{maintenance:true}})
  ```
- Force an update:
  ```
  db.remote_config.updateOne({_id:"active"},{$set:{min_supported_version:"9.0.0"}})
  ```
  Setting `latest_version` above the app version shows the "Update available" banner instead.
- Ban a player:
  ```
  db.users.updateOne({email:"…"},{$set:{banned:true}})
  ```
  Banned players are removed from leaderboards immediately, and their logins return 403.

## Backup / restore
1. **Backup** (online, consistent per collection):
   ```
   mongodump --uri "$MONGO_URL" --db "$DB_NAME" --gzip --archive=rr-$(date +%F).gz
   ```
2. **Restore** into a fresh database:
   ```
   mongorestore --uri "$MONGO_URL" --gzip --archive=rr-YYYY-MM-DD.gz --nsFrom "$DB_NAME.*" --nsTo "${DB_NAME}_restore.*"
   ```
   Verify the restored data, then switch `DB_NAME`, or restore with `--drop` into the original name during a maintenance window.
3. After a restore, run `python -m migrations.runner up` to ensure validators and indexes exist (it's idempotent).
4. Suggested schedule: nightly dumps kept for 14 days, plus weekly dumps kept for 8 weeks. Test a restore monthly.

## Phase 5/6 collections (migration `0003_admin`)
| Collection | Key fields | Indexes |
|---|---|---|
| `admins` | admin_id, email, name, role, password_hash (bcrypt), totp_enrolled, totp_secret / totp_pending (never returned by the API), failures[], locked_until, disabled | uniq admin_id, uniq email |
| `admin_sessions` | session_id, token_hash (sha256 of the cookie), csrf, admin_id, ip, user_agent, created_at, last_seen, revoked | uniq token_hash, (admin_id, revoked), TTL 13 h on created_at |
| `admin_audit` | audit_id, admin_id, admin_email, action, target, before, after, ip, time. **Append-only**: no API updates or deletes it. | time desc, (admin_id, time) |
| `config_versions` | version (int), status draft/pending_approval/approved/published/superseded/rejected, data{remote,catalog,missions,achievements,daily_rewards,events}, note, author, submitted_by, approver, publisher, rollback_of, kind | uniq version, status |
| `news` | news_id, slug, title, summary, body, image_url, status draft/published, published_at | uniq slug, (status, published_at) |
| `faq` | faq_id, question, answer, order, status | (status, order) |
| `deletion_requests` | request_id, email, note, status, ip, created_at | uniq request_id |
| `tickets` (Phase 3) | + name, email, source (app/website), assignee, replies[], confirmation_email_sent | + (status, created_at) |

- On first start, `rr.live.bootstrap()` creates config **v1** from the bundled defaults plus the existing events, then applies it.
- The Owner admin is upserted from env at every start and never overwritten.
- Demo rows are tagged `seed:"demo"`. To remove them: `db.users.deleteMany({seed:"demo"})`, and the same for runs, tickets and reports.

# Deployment — Rush Rivals

Three deployables share one domain. Ingress sends `/api/*` to the backend (port 8001) and everything else to the website/admin build.

| Surface | Source | Runtime |
|---|---|---|
| Backend API | `/app/backend` | `uvicorn server:app --host 0.0.0.0 --port 8001` (FastAPI, Python 3.11) |
| Database | — | MongoDB ≥ 6 (validators + TTL indexes are used) |
| Website + admin | `/app/frontend` | static build (`yarn build` → `build/`), served by any CDN or static host |
| Game | `/app/mobile` | Android app built by EAS (see `../release-checklist/`) |

**On Emergent:** click **Publish** (top right). It deploys the backend and website, and copies the `.env` keys to the deployment secret store. You edit them under Deployment → Secrets. Later deploys **don't** overwrite secrets that already exist there, so change production values in that panel.

## 1. HTTPS / domain
- Serve only over HTTPS. Admin cookies are `Secure` and `SameSite=Strict` on path `/api/v1/admin`, so they need HTTPS on the same origin as the admin UI.
- Point the custom domain at the deployment. The website and API must share that origin, so no CORS is needed for the admin. `CORS_ORIGINS` only matters for third-party callers.
- `TRUSTED_PROXY_HOPS` must equal the number of proxies between the client and the app. In the Emergent preview it is **3** (Cloudflare → ingress → service). With the wrong value, per-IP rate limits can be spoofed (too high) or every user shares one bucket (too low).
- Production check: confirm the response cookie stays `SameSite=Strict`. The preview proxy rewrites it to `None; Partitioned`.

## 2. Environment-variable checklist

### Backend (`backend/.env` / deployment secrets)
| Var | Required | Notes |
|---|---|---|
| `MONGO_URL`, `DB_NAME` | ✔ | Platform-provided in preview. Use a managed Mongo URL in production. |
| `ENV` | ✔ | **`production`** in prod. It rejects `mock_` purchase tokens (`mock_token_rejected`) and disables dev-only behaviour. Anything else counts as development. |
| `JWT_SECRET` | ✔ | ≥ 32 random bytes. Rotating it signs everyone out (players and the admin MFA step). |
| `RUN_TOKEN_SECRET` | ✔ | Signs run tokens (anti-cheat). |
| `TRUSTED_PROXY_HOPS` | ✔ | See §1. |
| `CORS_ORIGINS` | – | Comma list. Default `*`. |
| `EMERGENT_EMAIL_KEY` | ✔ | Emergent-managed (Resend proxy). Never expose it. |
| `EMAIL_FROM_NAME` | ✔ | Sender display name (`Rush Rivals`). The from-address is platform-managed. |
| `EMAIL_REPLY_TO` | – | Owner-controlled support inbox (Reply-To). |
| `ADMIN_OWNER_EMAIL`, `ADMIN_OWNER_PASSWORD` | ✔ | Seeds the first Owner at startup (idempotent, never overwritten). **Change both for production**, sign in and enrol TOTP straight away, then remove the password from the secret store if you like (the account persists). |
| `ANDROID_PACKAGE_NAME` | ✔ | `com.velactra.rushrivals` (Play Developer API calls). |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | prod | The service-account JSON **contents** (a secret, never a committed file). It needs Play Console "View financial data" and "Manage orders". Without it, verification returns 503 `verification_unavailable` and never auto-grants. |
| `PUBSUB_AUDIENCE`, `PUBSUB_PUSH_SERVICE_ACCOUNT` | prod | Verify the OIDC token on the RTDN push endpoint `/api/v1/purchases/rtdn`. |
| `RATE_LIMIT_AUTH`, `RATE_LIMIT_GAMEPLAY` | – | Per-minute overrides. |
| `EXPOSE_RESET_CODE_FOR_TESTS` | **never in prod** | `1` makes `/auth/forgot-password` return `debug_code`, for automated tests only. |

### Game build (EAS env / `app.config.js`)
| Var | Profile | Notes |
|---|---|---|
| `APP_ENV` | all | `production` switches to the real AdMob IDs (and requires them). |
| `EXPO_PUBLIC_BACKEND_URL` | all | `https://<your-domain>`. The app appends `/api/v1`. |
| `ADMOB_ANDROID_APP_ID`, `ADMOB_REWARDED_ID`, `ADMOB_INTERSTITIAL_ID` | production | From AdMob. Production builds fail fast if any is missing. Development uses Google's official test IDs. |
| `GOOGLE_SERVICES_JSON` | optional | Path to `google-services.json` (store it as an EAS **file secret**, never commit it). Firebase/Crashlytics plugins load only when it exists; otherwise the app logs "Firebase not configured". The file's package must be `com.velactra.rushrivals`. |

### Website (`frontend/.env`)
| Var | Notes |
|---|---|
| `REACT_APP_BACKEND_URL` | Same origin as the site in production. |

## 3. Database: migrations and rollback
- Migrations run automatically at backend startup (`migrate_up`, idempotent). You can also run them by hand:
  ```bash
  cd backend && python -m migrations.runner up          # apply pending
  python -m migrations.runner down 1                     # roll back the latest migration (indexes/validators only)
  ```
- Applied ids are stored in `_migrations`. Current ids: `0001_init`, `0002_billing`, `0003_admin`.
- Seed data (test players, demo staff, FAQ, demo players/ticket/report): `python seed.py`. It is idempotent. **Don't run it in production** unless you want the demo rows, which are all tagged `seed:"demo"`.
- **Live config rollback:** admin → Config → Rollback. This republishes an earlier version as a new version (no deploy needed).
- **Code rollback:** on Emergent, use the platform **Rollback** to a previous checkpoint and redeploy. Migrations are additive (indexes and validators), so older code keeps working against a newer schema.

## 4. Backup / restore
See `../database/README.md#backup--restore`. In short:
- Run `mongodump --uri "$MONGO_URL" --db "$DB_NAME" --gzip --archive=rr-$(date +%F).gz` nightly, keep 14 daily plus 8 weekly dumps, and test a restore monthly.
- Restore into `${DB_NAME}_restore`, verify it, then switch over.
- `admin_audit` is append-only. Archive it, never truncate it.

## 5. Monitoring
| Signal | Where | Alert when |
|---|---|---|
| Liveness | `GET /api/health` | non-200 for 2 min |
| API errors | backend logs (`/var/log/supervisor/backend.err.log` in preview). JSON error bodies carry `error.code`. | spike in 5xx, `verification_unavailable`, `email_failed` |
| Email | log lines `rr.mail`. `email_error` on tickets is shown in admin Tickets. | `insufficient_credits` / `integration_disabled` / `daily_limit_reached` (owner billing) |
| Purchases | admin Purchases (`verify_state`), RTDN logs | unverified purchases older than 1 h |
| Crashes / ANRs | Firebase Crashlytics (**only after `google-services.json` is added**). Play Console → Android vitals. | crash-free users < 99.5 %, ANR rate > 0.47 % |
| Ads revenue | AdMob console (the API isn't connected, so the dashboard says so) | — |
| Security | admin Audit log (sign-ins, enforcement, config publishes, exports) | unexpected `auth.sign_in` or `config.publish` |

## 6. Incident response
1. **Triage:** check `/api/health`, then the backend logs, then the admin Dashboard.
2. **Contain:**
   - Gameplay or config problem → admin → Flags → **Maintenance ON** (needs confirmation). The app shows the Maintenance screen and offline play still works.
   - Bad config → **Rollback** to the last good version.
   - Leaked admin session → that admin uses **Sign out everywhere**, or the Owner disables the admin (which revokes their sessions) and resets their MFA.
   - Leaked secret → rotate it in Deployment → Secrets and redeploy. Rotating `JWT_SECRET` signs everyone out. To rotate `EMERGENT_EMAIL_KEY`, contact Emergent support.
   - Fraudulent purchases → admin Purchases → **Revoke** (claws back unspent currency).
3. **Communicate:** news article plus optional in-game Inbox announcement (admin → Content → Publish with Inbox).
4. **Recover:** fix, redeploy, turn Maintenance OFF, and watch the error rate for 1 h.
5. **Post-mortem:** export the audit CSV for the incident window and attach it.

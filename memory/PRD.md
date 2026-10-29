# Rush Rivals — PRD / Progress

## Original problem statement
Android-first portrait arcade 3-lane endless runner (Velactra Game Studio) in Expo (Godot excluded). Build Phase 1 ONLY (F-1..F-9) per /app/memory/product/phase1/requirement.md; journeys.md = acceptance criteria. Skia renderer, pure-TS game logic with jest tests, 2.5D City world with original AI art, reusable UI components, swipe + keyboard + optional touch buttons, fair spawner, bank-once economy, versioned safe save with corruption recovery, auto-pause, Android back handling, sound/haptics toggles, dev FPS counter, architecture doc. Backend only /api/health + /api/openapi.json.

## Architecture
See /app/docs/architecture/README.md. Expo 58. The run renderer is **three.js 0.186 via expo-gl** (`src/game/three/`). Skia 2.14 is kept as the automatic fallback (JS rAF loop → SkPicture SharedValue). Also: gesture-handler v3, expo-audio, expo-haptics, and the storage util (AsyncStorage/localStorage).

## 3D renderer refinement (2026-10-29)
- **Runner:** a rigged Quaternius UAL1 CC0 humanoid, an embedded GLB (793 KB). AnimationMixer crossfades between jog/sprint (timeScale tied to speed), jump start/loop/land, roll and death, with lean on lane changes.
- **Per-character looks:** per-vertex outfit colours, plus hair/hood/headband meshes attached to the Head bone.
- **World:** chase camera that rises on roofs; 3 tracks with rails and instanced sleepers; pooled trains with windows, lights and runnable roofs; ramps; barriers; instanced spinning coins; glowing pickups; instanced buildings and lamps; per-world palettes; sky dome; fog; blob shadow.
- **Graphics Low/Med/High:** offscreen render scale 0.6/0.8/1, antialias, shadow maps (High only) and draw distance.
- **Skia 2D fallback:** used automatically if GL is unavailable or fails/times out. If the web has no WebGL at all, the app shows a "Graphics not supported" message instead.
- **Menu:** front-facing 3/4 hero art per character; Leaderboard label on one line.
- **Polish pass:**
- **E2E fixes (iteration 2):**
  - Offline banner: on web it uses navigator.onLine plus online/offline events; on native it uses NetInfo. It is hidden during runs.
  - Offline startup: the splash decodes every game image into memory (imageCache); a failed asset falls back to a colour image. On web it also preloads CanvasKit and the RunScreen chunk, so PLAY works fully offline.
  - Onboarding order: Welcome → Language → Age → Terms (consent checkbox; Continue disabled until ticked) → Permissions → Intro → Name → Gift → Tutorial.
  - Permissions step: notification and ad-personalisation toggles. The OS prompt appears only when notifications are toggled on; if denied, the step shows "You can enable notifications later in Settings."
  - Intro: 4 panels with Next and Skip.
  - Settings: Notifications and Personalised ads toggles added.
  - Coins: bevelled lathe rim, inner ring, embossed star, Phong gold with specular highlight, knee height, spinning, pooled sparkle on pickup.
  - Trains: per-world liveries (3 schemes per world); textured sides with window strip, pillars and doors; cab front with windscreen, headlights, destination board and bumper; livery-tinted roof panels with trim-coloured raised edges, vents and pantograph.
  - Ramps: yellow/black chevrons.
  - Barriers: chunky A-frame barricades with amber lamps; overhead slide-under gantry with a ↓ warning sign.
  - Cards: Kai and Leo art regenerated to match the 3D colours; Zoe's 3D shoes set to yellow to match her card.
  - Dev-only `__RR_DEBUG__.placeShowcase()` added for screenshots.
- **Docs:** licences in /app/docs/licenses.md; screenshots refreshed in /app/docs/screenshots/phase2/.
- **Not verified:** native Android GL performance and FPS (requires a device or build).

## Implemented (2026-10-29) — Phase 1
- F-1 Splash (logo + loading bar) → Velactra branding 1.5s → Menu; init error panel + Retry
- F-2 Main Menu: Player, coins, best, gold PLAY, Sound/Vibration/Touch-buttons toggles, Exit Game? dialog on back
- F-3 3-2-1-GO countdown, 3 lanes, swipe/keys/touch buttons, 1-action buffer + cooldown
- F-4 Rule-based fair spawner (low/high/train), coin lines/arcs, speed ramp 12→28 m/s cap, pooling
- F-5 HUD score/distance/coins/pause + dev FPS
- F-6 Pause/Resume(3s)/Restart confirm/Home confirm, auto-pause on background, back → pause
- F-7 Crash shake/flash → Game Over summary, New Best badge, Play Again/Home
- F-8 Versioned checksummed save, safe write, migration hook, corruption → defaults + toast
- F-9 Procedural original SFX + haptics with toggles, silent fallback
- Tests: 40/40 jest (incl. 10,000-row fairness, 5×4-min autopilot runs, bank-once, save). Testing agent iteration 1: all journeys pass on web.

## Backlog
- DONE in Phase 2 (2026-10-29), see below
- P1 (Phase 3+): accounts, cloud save, online leaderboards, remote config, real BillingService/AdsService
- P2: per-character art polish for the rig (faces/clothing detail), full translations for the 6 Indic languages, website, admin, release prep
- Verify on mid-range Android device: FPS ≥45, swipe latency, audio latency

## Implemented (2026-10-29) — Phase 2 (F-10..F-20 + priority feedback)
- Slower start (~8.5 m/s, smooth ramp, easy first 10 s); ramp trains with roofs, vertical physics, roof-to-roof, fast-drop, oncoming trains with warning lights, front-crash; fairness tests
- Skia renderer: world palettes, rails/sleepers, ramps, train bodies, pickups, shield bubble, procedural character animation (single sprite)
- Onboarding (language, age/child mode, terms, name, how-to-play, welcome gift); storyboard main menu; 3-wide collections (6 chars, 6 boards, 6 worlds) buy/equip/level locks
- Economy applyTx (ledger, idempotent event IDs, no negatives) for run banking, purchases, daily, missions, inbox, shop, revive; XP/levels; save v2 + v1 migration
- Power-ups magnet/shield/speed/x2/hoverboard + HUD timers; revive (5/10 gems, ads "Available soon")
- Missions/achievements, 7-day daily (clock-rollback guard), shop (real money → "Store not available yet"), inbox, profile/stats/local leaderboard, settings (graphics, language, help/legal, reset, dev panel), offline banner, BootGate (no save overwrite on reload)
- Original chiptune music; i18n EN complete + fallback; docs/architecture + docs/screens.md
- Tests: 91/91 jest; testing agent iterations 2–3 pass (critical reload data-loss bug found & fixed)
- MOCKED: BillingService and AdsService are stubs

## Implemented (2026-10-29) — Phase 2 gap list from root
- Skia 2D cut-out character rig (rig.ts + rigDraw.ts): cel-shaded and outlined, 10-keyframe run cycle at 12–15 fps scaled by speed, jump takeoff/air/fall, landing crouch, duck slide, lane lean, crash stumble; a separate look for each of the 6 characters; dev-only /dev-rig contact sheet
- Roof readability: carriage cut face under the runner, surface shadow that separates when airborne, camera lift on roofs; roof routes scheduled in normal play (first after 30 s, then every 15–25 s of run time)
- Interactive tutorial (/tutorial): 7 steps that freeze with a hand/arrow hint until the correct swipe; Skip; Replay from Settings with no re-grant; /get-started character + board intro
- Languages: en, hi, bn, ta, te, kn, ml with the core menu translated and English fallback; toasts dismiss on route change; deep links return to their screen after the splash
- Tests: 99/99 jest; testing agent iteration 4 passed; screenshots in /app/docs/screenshots/phase2/

## Phase 3 online (2026-10-29)
- **Backend:** FastAPI `/api/v1` with domain routers in `rr/` and a services layer (economy, mailer). MongoDB with validators, indexes, migrations (up/down) and a seed script.
- **Auth:** JWT email/password with rotating hashed refresh tokens; Emergent Google sign-in; reset codes emailed through Emergent email; typed-DELETE account deletion.
- **Server-authoritative economy:** wallet, ledger, inventory, daily rewards, missions, achievements, purchases and spend sinks. Idempotency-Key on every value write.
- **Runs:** signed single-use run tokens with plausibility checks; offline runs get capped grants and stay off the leaderboard.
- **Online features:** leaderboard (daily/weekly/all, report player), events (seeded Temple Rush), remote config (maintenance and update gates), support tickets, inbox claim-once, rate limits, consistent error shape.
- **App:** ordered sync queue (Synced toast, "Cloud sync failed" + Retry), account screen with link-conflict dialog, Leaderboard/Events/Support screens. Guests are unchanged.
- **Tests:** backend pytest 41/41 (phase3, spot checks, extra economy, iteration 8 retest, health); app Jest 99/99. E2E testing-agent iterations 7 and 8: every finding fixed; iteration 8 passed 31/31 frontend checks.
- **Iteration 7 fixes:**
  - The first run from Play now gets a server run token.
  - Sign-out, account deletion and revoked sessions reset the local wallet, so currency can't be copied between accounts.
  - The rate-limit client IP is taken `TRUSTED_PROXY_HOPS` (3) from the right of `X-Forwarded-For`, so spoofing doesn't bypass it.
  - The server decides revive pricing.
  - Menu: the bottom row has 4 buttons, Account is a cloud icon in the top bar, and the new labels are translated.
  - Remote config: "Play offline" during maintenance; the update banner shows "Update now" / "Later".
  - Leaderboard signed out shows personal bests; the event claim button shows disabled until the target is reached.
  - The navigation stack is dismissed on sign-out; the wallet is refreshed on launch.

### Backlog
- **P1:**
  - Revive cap is per client run id: the server can't link local run ids, so an unlimited number of 5-gem revives is possible. No free currency.
  - Sign-out also clears a guest's own onboarding gift.
  - Native Android checks: Google sign-in redirect, offline queue, 3D performance.
- **P2:** Phase 4: real billing and ads, purchase verification router. Phase 6: admin/RBAC router.

## Phase 4 monetization (2026-10-29)
- **Ads:** AdMob rewarded + interstitial (react-native-google-mobile-ads 17.4 with config plugin; expo-dev-client). Test IDs in dev; production IDs from env via app.config.js. UMP consent; non-personalised ads in child mode or when personalisation is off.
  - Rewarded placements: revive (1 ad revive per run), double coins (once per run), Leo/Galaxy unlock progress (5 views).
  - Rewards granted only on EARNED_REWARD, with an 8 s load timeout.
  - Interstitials follow REQ-164 caps, and never show with Remove Ads.
- **Billing:** Google Play Billing via expo-iap 6.3.0. BillingEngine state machine (verify → grant → consume/acknowledge); reconcile on launch; restore.
  - Shop has Coins/Gems/Offers tabs and a state dialog for every state.
  - Parental gate before purchases in child mode.
- **Server:**
  - `/purchases/verify` calls the Play Developer API, with a unique purchaseToken index; returns verification_unavailable when unconfigured; accepts mock tokens only when ENV=development.
  - Entitlements; RTDN webhook with Pub/Sub JWT verification; Voided Purchases poll; refund revocation with ledger entry.
  - `/ads/reward` (idempotent). Migration 0002.
- **Firebase:** Crashlytics + Analytics adapters. The plugin is conditional on google-services.json; the app logs "Firebase not configured". Analytics consent toggle; Privacy & ad choices in Settings.
- **JRN-79:** "Continue as guest" after a failed sign-in.
- **Docs:** /app/docs/integrations/{admob,play-billing,firebase,resend,google-auth}.md
- **Still needed:** real-device verification of ads, billing and Firebase; Play Console products; service account; Pub/Sub RTDN; production AdMob IDs; google-services.json; set ENV=production in deployment secrets.

## Phase 5/6 backend (2026-10-29) — public website API + admin/operations API (no web UI)
- Public `/api/v1/public/*` (9 endpoints): catalog with art (`/api/static/game/*`), news list/slug (empty by default), FAQ (5 seeded), site-config, sitemap, contact (honeypot, signed 3 s form token, 5/h/IP, RR-xxxxxx, Resend confirmation), data-deletion.
- Admin `/api/v1/admin/*` (~54 endpoints): separate `admins` realm, mandatory TOTP (replay-protected), lockout 5/15 min, HttpOnly Secure SameSite=Strict cookie, 30 min idle / 12 h max, CSRF, sessions; 7 roles × domain:action permissions; dashboard (Firebase/AdMob honestly not connected); players (masked), idempotent compensation, ban/suspend (auto-expiry, immediate token rejection, leaderboard hiding); reports; ledger; versioned config (draft→diff→submit→four-eyes approve→publish→rollback-as-new-version, stale-draft guard, quick maintenance/flags); news/FAQ (+inbox); purchases reverify/revoke; tickets assign/reply/close; append-only audit + CSV export (formula-safe).
- Published config is applied live (prices/missions/daily/achievements/events/remote config). Mobile `src/online/liveCatalog.ts` applies `/api/v1/catalog` over bundled tables, with an offline cache.
- Tests: backend 68/68 (incl. test_phase56 8/8: permission matrix for every endpoint × role, audit completeness, secret scan, spam, four-eyes, rollback); live API 23/23; Jest 117/117.
- Next: web specialist builds /app/frontend website + admin UI against these APIs. Backlog: split admin.py into domain routers; persistent (Mongo/Redis) rate limiter for multi-instance; Play price data for revenue.

## Phase 7 release prep (2026-09)
- Android identity: com.velactra.rushrivals 1.0.0 (1), targetSdk 36 (Play requirement from 2026-08-31), compileSdk 37, unused permissions blocked, notification icon. `expo prebuild` ✔, expo-doctor 20/20. eas.json is Emergent-managed → profiles documented in docs/release-checklist/eas.profiles.json.
- Email: root cause = proxy blocks undeliverable *.test recipients (422). Reason now stored/shown (`email_error`). Real 202 sends: reset, contact confirmation, ticket reply → delivered@resend.dev.
- 3D lifecycle: GL scene released on background/low memory and rebuilt on resume (glLifecycle.ts + test, verified on web).
- Store assets, deployment/release-checklist/testing docs, top-level README, .gitignore hardening, final screenshots (14).
- Tests: Jest 119/119, backend 91/91 (after rerun), web build OK.

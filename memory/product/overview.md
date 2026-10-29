# Requirements: Rush Rivals

Studio: Velactra Game Studio. Genre: arcade endless runner. First platform: Android (portrait).

## Core Value
A fast, juicy, offline-capable 3-lane endless runner: swipe to dodge, jump and slide, collect gold coins, beat your best score, and keep coming back for characters, boards, worlds, missions and daily rewards.

## Personas & Roles
- **Player (guest)**: plays offline with no login; progress saved on device.
- **Player (signed in)**: email+password or Google sign-in; cloud save, leaderboards, server-validated rewards/purchases.
- **Website visitor**: learns about the game, reads news, contacts support, reads legal pages.
- **Admin roles** (admin panel): Owner, Ops/LiveOps editor, Publisher, Support agent, Finance (refund ops), Moderator (enforcement), Viewer. Least privilege; MFA mandatory for privileged roles.

## Architecture (confirmed)
- Godot is excluded by the user. Chosen: **Expo (React Native) native Android app** at `/app/mobile` (= `/game`), rendering with React Native Skia / Reanimated (or equivalent performant native renderer), gesture-handler swipes, expo-haptics, expo-av/expo-audio.
- **Backend**: FastAPI + MongoDB at `/app/backend` (schema validation, unique indexes for idempotency, versioned migration scripts). Versioned API `/api/v1`, OpenAPI at `/api/openapi.json`.
- **Website + Admin**: React app at `/app/frontend` — public site at `/`, admin at `/admin` (separate auth realm).
- Docs at `/app/docs/{architecture,api,database,integrations,testing,deployment,release-checklist}`.
- Ads and billing native modules require an EAS dev/release build; in the web/Expo Go preview they run as clearly labelled MOCK adapters.
- Gameplay never depends on network.

## Features
| id | feature | persona | phase |
|---|---|---|---|
| F-1 | Splash + studio branding + asset/save init | Player | 1 |
| F-2 | Main menu (Home) with PLAY, player name/level, coin balance | Player | 1 |
| F-3 | Countdown, active run: auto-forward, 3 lanes, swipe L/R/up/down, input buffering | Player | 1 |
| F-4 | Procedural fair track: obstacle patterns, coin paths, rising speed, pooling | Player | 1 |
| F-5 | HUD: score, coins, distance, pause | Player | 1 |
| F-6 | Pause / resume countdown / restart confirm / home; auto-pause on background | Player | 1 |
| F-7 | Collision → game over summary, new-best celebration, play again | Player | 1 |
| F-8 | Local versioned save (best score, coins, stats), corruption recovery | Player | 1 |
| F-9 | Haptics + sound/music with audio-unavailable fallback | Player | 1 |
| F-10 | First-launch welcome, language, age gate, terms/privacy consent, permissions explainer, intro, welcome reward (one-time) | Player | 2 |
| F-11 | Tutorial (lanes, jump, slide, coins, obstacles, power-ups), skip, replay from settings | Player | 2 |
| F-12 | Power-ups: magnet, shield, speed boost, score multiplier, hoverboard protection + indicators | Player | 2 |
| F-13 | Characters, hoverboards, worlds (City, Beach, Snow, Night City, Temple, Lava) unlock/equip | Player | 2 |
| F-14 | Economy service: coins (soft) + gems (premium, labelled paid), ledger, no negatives, idempotent claims | Player | 2 |
| F-15 | Player level/XP, profile, statistics | Player | 2 |
| F-16 | Daily missions, general missions, achievements (available/in progress/completed/claimed/expired) | Player | 2 |
| F-17 | 7-day daily rewards with reliable date boundary, streak rules, already-claimed state | Player | 2 |
| F-18 | Settings: sound, music, vibration, language, graphics, notifications, accessibility touch buttons, data management | Player | 2 |
| F-19 | Inbox/notifications, help & support, privacy, terms, exit confirmation | Player | 2 |
| F-20 | System states: offline, loading, empty, retry, generic error, save failure, data-corruption recovery | Player | 2 |
| F-21 | Accounts: email+password (JWT) + Emergent Google sign-in, guest→account linking, recovery, sign-in failure | Player | 3 |
| F-22 | Cloud save sync with conflict handling + failed-sync state | Player | 3 |
| F-23 | Server-validated rewards/currency, missions/events config, anti-replay | Player | 3 |
| F-24 | Global leaderboard with score validation + anti-abuse; events screen | Player | 3 |
| F-25 | Remote config, maintenance mode, update-available / mandatory-update | Player | 3 |
| F-26 | Support tickets + player reports from app | Player | 3 |
| F-27 | AdsService: AdMob (test units) rewarded revive, double coins, capped interstitials, consent (UMP), remove-ads check, dev mode | Player | 4 |
| F-28 | BillingService: Google Play Billing (expo-iap): coin/gem packs, starter bundle, cosmetic bundles, remove-ads; all purchase states; restore; server verification; refunds/revocations; mock adapter | Player | 4 |
| F-29 | Firebase Crashlytics + Analytics adapters with consent | Player | 4 |
| F-30 | Public website: home, features, characters/worlds/boards/power-ups, news, download (real links only), FAQ, contact form, legal, data deletion, SEO, 404 | Visitor | 5 |
| F-31 | Admin panel: login + TOTP MFA, RBAC, dashboards, player search/support, moderation, economy/transactions, catalogue, missions/events/daily rewards, news publishing, remote config draft→approve→publish→rollback, purchases/entitlements, ad reports, tickets, feature flags, maintenance, versions, audit log, sessions | Admin | 6 |
| F-32 | Automated tests, EAS build config (APK/AAB), signing procedure, Play Console docs, store listing assets, release checklist, monitoring/backup/rollback docs | Owner | 7 |

## Phases
- **Phase 1 — MVP playable runner (Expo)**: F-1..F-9. [requirement](phase1/requirement.md) · [journeys](phase1/journeys.md)
- **Phase 2 — Full game content & progression**: F-10..F-20.
- **Phase 3 — Backend & accounts**: F-21..F-26.
- **Phase 4 — Monetization & diagnostics**: F-27..F-29.
- **Phase 5 — Public website**: F-30.
- **Phase 6 — Admin & operations panel**: F-31.
- **Phase 7 — Testing, Android build & release prep**: F-32.

## UI/UX Rules
- Match the supplied storyboards' design language (user may accept improvements, report them): dark navy panels, electric blue primary buttons, gold coins/rewards, green success, red destructive, rounded cards, bold chunky cartoon title logo, high contrast text.
- Portrait only, safe areas, scales small→large phones, touch targets ≥ 48dp.
- Reusable components: PrimaryButton, SecondaryButton, IconButton, CurrencyBalance, CharacterCard, BoardCard, WorldCard, MissionCard, RewardDialog, ConfirmationDialog, LoadingOverlay, ErrorPanel, EmptyState, ToastMessage, NetworkStatus, PurchaseStatusDialog, PauseMenu.
- No dead-end screens; every dialog has confirm/cancel/back. No permanent spinners. Accessibility labels on all controls.
- Original AI-generated art only; no copyrighted characters/logos; no unlicensed audio.
- No ads during active gameplay; no fake download buttons, player counts, reviews or announcements.

## Integrations
| integration | choice | status note |
|---|---|---|
| Game rendering | Expo + RN Skia/Reanimated + gesture-handler | Phase 1 |
| Haptics/audio | expo-haptics, expo-audio | Phase 1 |
| Auth | JWT email+password AND Emergent-managed Google sign-in | Phase 3 |
| Ads | Google AdMob via react-native-google-mobile-ads (test units) | needs EAS build; MOCK in preview; user's AdMob account for production |
| Billing | Google Play Billing via expo-iap | needs EAS build + Play Console products + service account for server verification; MOCK in preview |
| Crash/analytics | Firebase Crashlytics + Analytics | user's Firebase project (google-services.json) |
| Email (support) | Emergent-managed Resend | Phase 5/6 |
| Pricing | INR and USD, set per region in Play Console | product IDs configured, never invented as live |

## Edge Cases
- App backgrounded mid-run → auto-pause; resume via countdown.
- Repeated swipes → buffered, one action per cooldown; lane boundaries clamp.
- Spawner must never create unavoidable patterns (always ≥1 passable lane/action).
- Restart / repeated game-over events must not double-grant coins.
- Corrupt or old-version save → migrate or restore safe defaults with notice; never crash.
- Date boundary for daily rewards uses device local date with clock-rollback protection (server time when online).
- Currency never negative; duplicate claim/purchase event IDs ignored.

## Seed Data
- Characters: Rush (default), Zoe, Kai, Shadow, Nova, Leo. Boards: Default, Flame, Neon, Dragon, Ice, Galaxy. Worlds: City (default), Beach, Snow, Night City, Temple, Lava. Prices per storyboard (coins or gems). Phase 1 uses Rush + City only.
- New player starts with 0 coins in Phase 1 (welcome gift of 2,000 coins / 50 gems / 3 power-ups added in Phase 2).

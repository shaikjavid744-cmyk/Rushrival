# Phase 7 Requirement — Testing, Android Build & Release Prep

Version: phase-7. See `../overview.md` (F-32). Builds on Phases 1–6 as delivered (Expo game with 3D renderer, monetization adapters, FastAPI backend, React website + admin).

## Goal
Make the project release-ready and honest: complete automated test coverage, reproducible Android debug APK / release AAB build configuration, Play Store listing assets, and complete documentation of deployment, release, monitoring and what still needs the owner's accounts.

## Functional requirements
- REQ-239 [always] The Android app shall have application ID `com.velactra.rushrivals`, versionName 1.0.0 and versionCode 1, with a documented bump procedure. (interpreted ID; owner may change before first upload)
- REQ-240 [always] eas.json shall define development (dev client, test ads, mock-allowed backend), preview (internal APK) and production (AAB, production env) profiles.
- REQ-241 [always] App icon (adaptive), splash and notification icon shall be original Rush Rivals art at required sizes.
- REQ-242 [always] Signing shall use EAS-managed or owner-supplied upload keystore; no keystore or secret shall be committed; docs shall explain backup and Play App Signing.
- REQ-243 [always] Target SDK shall meet the current Google Play target API requirement verified at build time (document the value).
- REQ-244 [always] Store listing assets shall be produced: 512px icon, 1024x500 feature graphic, at least 6 phone screenshots captured from the real game, short and full description.
- REQ-245 [always] Docs shall exist: /app/docs/deployment (backend, database, website, env-var checklist, HTTPS/domain, migrations + rollback), /app/docs/release-checklist (internal testing, closed testing, Data Safety answers from actual behaviour, content rating, ads declaration, target audience, privacy policy URL, Crash/ANR review, rollback), /app/docs/testing (what is automated, how to run, latest real results, device-only tests list).
- REQ-246 [always] Transactional email (password reset, ticket confirmation/reply) shall be sent successfully via Emergent-managed Resend, or the exact failing reason documented.
- REQ-247 [always] The backend shall run with ENV=production rejecting mock purchase tokens, documented in the env checklist.
- REQ-248 [always] A single test command per surface shall run all tests: mobile jest, backend pytest, website build + lint.
- REQ-249 [always] Low-memory and app background/resume handling shall release 3D resources on background and restore them on resume without crash. (interpreted)
- REQ-250 [unwanted] If an EAS build cannot run in this environment (no Expo account token), then the system shall document the exact commands and leave the project build-ready.

## Quality requirements
```
Q-36 Tag: Tests.Pass
     Scale: % of automated tests passing across mobile, backend, web
     Meter: test commands
     Must: 100   Plan: 100
Q-37 Tag: Build.Reproducible
     Scale: steps for owner to produce a signed AAB from clean checkout
     Meter: following docs
     Must: documented, ≤ 10 commands   Plan: one command per profile
Q-38 Tag: Secrets.Hygiene
     Scale: secrets/keystores/service accounts in repo
     Meter: grep scan
     Must: 0   Plan: 0
Q-39 Tag: Honesty.Status
     Scale: integrations reported live without real verification
     Meter: review of docs
     Must: 0   Plan: 0
```

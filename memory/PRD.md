# Rush Rivals — PRD / Progress

## Original problem statement
Android-first portrait arcade 3-lane endless runner (Velactra Game Studio) in Expo (Godot excluded). Build Phase 1 ONLY (F-1..F-9) per /app/memory/product/phase1/requirement.md; journeys.md = acceptance criteria. Skia renderer, pure-TS game logic with jest tests, 2.5D City world with original AI art, reusable UI components, swipe + keyboard + optional touch buttons, fair spawner, bank-once economy, versioned safe save with corruption recovery, auto-pause, Android back handling, sound/haptics toggles, dev FPS counter, architecture doc. Backend only /api/health + /api/openapi.json.

## Architecture
See /app/docs/architecture/README.md. Expo 58 + Skia 2.14 (JS rAF loop → SkPicture SharedValue), gesture-handler v3, expo-audio, expo-haptics, storage util (AsyncStorage/localStorage).

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
- P0 (Phase 2): onboarding, tutorial, power-ups, characters/boards/worlds, economy service, missions, daily rewards, settings screen
- P1 (Phase 3+): accounts, cloud save, leaderboards, remote config
- P2: ads/billing (EAS build), website, admin, release prep
- Verify on mid-range Android device: FPS ≥45, swipe latency, audio latency

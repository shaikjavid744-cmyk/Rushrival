# Rush Rivals — Architecture (Phase 1)

## Stack
- **Game client:** Expo SDK 58 (React Native 0.88, expo-router), at `/app/mobile`.
- **Rendering:** `@shopify/react-native-skia` 2.x. Each frame, a JS-thread `requestAnimationFrame` loop
  (1) steps the pure-TS simulation and (2) records one `SkPicture` (road, scenery, sprites) that it writes into a
  Reanimated `SharedValue` rendered by `<Canvas><Picture/></Canvas>`. React only re-renders HUD text (~10 Hz).
  On web, CanvasKit (`public/canvaskit.wasm`) is loaded during the splash (`LoadSkiaWeb`) and the run screen is
  code-split behind `WithSkiaWeb` (`src/game/RunHost.web.tsx`).
- **Input:** gesture-handler v3 `usePanGesture` (fires on threshold during the drag, not on release), keyboard
  arrows/WASD on web, optional on-screen buttons. One-action buffer + 120 ms cooldown in `player.ts`.
- **Audio/haptics:** `expo-audio` (procedurally generated original WAVs in `assets/sfx`, built by `/app/art_src/sfx.py`),
  `expo-haptics`. Audio init failures are swallowed → silent game.
- **Save:** `@/src/utils/storage` (AsyncStorage/localStorage). Versioned envelope `{v, sum, data}` with FNV-1a checksum,
  strict validation, migration hook (`MIGRATIONS`), temp-then-main safe write, marker key to tell "corrupt" from "fresh".
- **Backend:** FastAPI at `/app/backend` — Phase 1 exposes only `/api/health` and `/api/openapi.json`. Gameplay is 100% offline.

## Modules
```
src/game/          pure TS (unit-tested, no React/Skia imports)
  constants.ts     tuning (speeds, physics, gaps)
  player.ts        lane / jump / slide state machine + input buffer
  collision.ts     obstacle + coin tests
  spawner.ts       rule-based fair rows (never 3 trains; gap >= speed*0.95 s) + coin lines/arcs
  engine.ts        simulation, fixed 1/120 s sub-steps, object pools, event queue
  pool.ts, rng.ts, scoring.ts, projection.ts (2.5D pseudo-perspective math)
  renderer.ts      Skia drawing (only file touching Skia besides RunScreen)
  RunScreen.tsx    loop, phases (countdown/running/paused/crashed/over), HUD + overlays
src/save/          schema, checksum, saveManager, economy (bank-once by runId)
src/components/ui/ PrimaryButton, SecondaryButton, IconButton, CurrencyBalance, ConfirmationDialog,
                   LoadingOverlay, ErrorPanel, ToastMessage, PauseMenu, ToggleTile
```
Tests: `cd /app/mobile && npx jest` (player, collision/score/engine, spawner fairness + 4‑minute autopilot runs, save/economy).

## Why not Godot
Excluded by the product owner. Expo keeps one TypeScript codebase for game + future account/shop/ads/billing UI,
shares tooling with the website/admin, and Skia gives GPU-backed 2D drawing that is sufficient for a 2.5D runner.

## Android packaging (later, Phase 7)
EAS Build (managed by Emergent's Publish flow) produces APK/AAB from this project; `android.package` in `app.json`
is the stable application id. Skia, expo-audio and gesture-handler are all included in Expo Go and in EAS builds,
so no custom native code is required for Phase 1.

## Dev-only tools (`__DEV__` only, never in release)
- FPS counter in the HUD.
- Long-press the Main Menu coin balance for 3 s → corrupts the save and relaunches the splash ("Save data was reset").
- Web query flags: `?devCorruptSave=1`, `?devFailInit=1` (init error + Retry), `?devNoAudio=1` (audio failure path).
- Web: Escape = Android back; `window.__RR_DEBUG__.state` exposes run state for automated tests.

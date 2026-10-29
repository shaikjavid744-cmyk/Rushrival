# Rush Rivals — Screen inventory (Phase 2)

| Route | Screen | Entered from | Back / exit |
|---|---|---|---|
| `/` | Splash → Velactra brand → loads save | App launch | — (redirects to `/onboarding` on first launch, otherwise `/menu`) |
| `/onboarding` | Welcome + language → age (child mode) → terms → name → how to play → welcome gift | First launch, Reset progress | Gift claim → `/tutorial` (replace) |
| `/tutorial` | Interactive tutorial run (7 frozen steps with hand/arrow hints, Skip) → "Tutorial complete" | After onboarding; Settings → Replay tutorial (`?replay=1`) | Skip/Continue → `/get-started` (first time) or back to Settings (replay) |
| `/get-started` | Character + board introduction, "Get Started" | After tutorial | Get Started → `/menu` (replace) |
| `/dev-rig` | Dev-only pose contact sheet (all characters × all poses) | Direct URL in dev builds | — (redirects to `/` in release) |
| `/menu` | Main menu (player card, coins/gems + "+", logo, hero, Missions/Daily/Shop, Characters/Boards/Worlds, PLAY, Leaderboard/Settings/Inbox) | Splash, Game Over → Home, Pause → Home | Android back → Exit dialog |
| `/run` | Run: countdown, HUD (pause, score + x2, coins, power-up timers, hoverboards), Pause, Restart/Home confirmations, Revive, Game Over | PLAY | Back → pause; while paused → resume; Revive → decline; Game Over → Home |
| `/collection/characters` `/boards` `/worlds` | 3-wide collection grid with a bottom tab bar; buy (coins/gems) / equip; ad items "Available soon"; level locks | Menu squares | Header back → menu |
| `/daily` | 7-day reward calendar + claim | Menu Daily | Header back |
| `/missions` | Missions / Achievements tabs, progress bars, claim → RewardDialog | Menu Missions | Header back |
| `/shop` | Hoverboards & coin packs (in-game currency), gem packs (real money → "Store not available yet") | Menu Shop, gem "+" | Header back |
| `/inbox` | Messages (expand, mark read, claim gift) | Menu Inbox | Header back |
| `/profile` | Name edit, level/XP, lifetime stats, local top-10 leaderboard | Player card, Leaderboard | Header back |
| `/settings` | Sound/Music/Vibration, on-screen buttons, large text, graphics, language (7, horizontal row), Replay tutorial, Help/Privacy/Terms, Reset progress, Developer panel (dev only) | Menu Settings | Header back |
| `/help` | FAQ, contact support (mailto), privacy/terms links | Settings | Header back |
| `/legal/privacy` `/legal/terms` | Legal documents | Settings, Help | Header back |

Overlays (not routes): ToastMessage, ConfirmationDialog, PauseMenu, RevivePanel, GameOverPanel, RewardDialog, PurchaseStatusDialog, NetworkStatus banner, save-error banner, ErrorBoundary fallback.

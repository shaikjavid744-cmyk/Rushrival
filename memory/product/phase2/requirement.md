# Phase 2 Requirement — Full Game Content & Progression

Version: phase-2. See `../overview.md` (F-10..F-20). Builds on Phase 1 as delivered (Expo + Skia, src/game engine, src/save versioned save, UI components). All offline; no backend in this phase.

## Goal
Turn the MVP into the full single-player game from the storyboards: first-launch flow, tutorial, power-ups, characters/boards/worlds collection, one authoritative economy (coins + gems), levels, missions, achievements, daily rewards, profile/stats, settings, inbox, help/legal, and every system/error state — no dead ends.

## Functional requirements
### First launch (F-10)
- REQ-42 [event] When the app launches for the first time, the system shall show the Welcome screen after branding instead of the Main Menu.
- REQ-43 [event] When the player continues from Welcome, the system shall show Language selection with English, Hindi, Bengali, Tamil, Telugu, Kannada, Malayalam.
- REQ-44 [always] UI strings shall come from a localization table; English shall be complete and other languages shall fall back to English for missing keys. (interpreted)
- REQ-45 [event] When language is chosen, the system shall show the age screen "Are you 13 or older?" with "I am 13 or older" and "I am under 13".
- REQ-46 [event] When "I am under 13" is chosen, the system shall enable child mode (no personalised ads flag, no purchases without confirmation gate, no account features). (interpreted)
- REQ-47 [event] When the age step completes, the system shall show Terms & Privacy with a consent checkbox.
- REQ-48 [unwanted] If the consent checkbox is unchecked, then the system shall keep "Continue" disabled.
- REQ-49 [event] When consent is given, the system shall show a Permissions explainer listing Notifications and Ads personalisation with toggles, requesting OS permission only when a toggle is turned on.
- REQ-50 [unwanted] If the OS notification permission is denied, then the system shall keep the toggle off and show "You can enable notifications later in Settings".
- REQ-51 [event] When permissions step completes, the system shall play a skippable intro sequence ("A new runner rises… New places… New rivals… Are you ready?").
- REQ-52 [event] When the intro ends, the system shall show the Welcome Gift: 2,000 coins, 50 gems, 3 power-ups with a "Claim" button.
- REQ-53 [event] When Claim is tapped, the system shall grant the gift exactly once via the economy service.
- REQ-54 [unwanted] If the welcome gift was already claimed, then the system shall never show or grant it again.
### Tutorial (F-11)
- REQ-55 [event] When the welcome gift is claimed, the system shall start an interactive tutorial run teaching swipe left/right, jump, slide, coin collection, obstacle avoidance, power-up pickup in order.
- REQ-56 [state] While a tutorial step is active, the system shall show a hand/arrow hint and wait until the player performs that action.
- REQ-57 [always] The tutorial shall have a "Skip" button.
- REQ-58 [event] When the tutorial completes or is skipped, the system shall show character/board introduction then "Get Started" to the Main Menu.
- REQ-59 [event] When "Replay tutorial" is tapped in Settings, the system shall start the tutorial again without re-granting the welcome gift.
### Power-ups (F-12)
- REQ-60 [always] The track shall spawn five power-ups: Coin Magnet, Shield, Speed Boost, Score Multiplier (x2), Hoverboard.
- REQ-61 [state] While Magnet is active, the system shall pull nearby coins in all lanes to the runner.
- REQ-62 [event] When the runner hits an obstacle while Shield is active, the system shall consume the shield and continue the run.
- REQ-63 [state] While Speed Boost is active, the system shall increase speed and make the runner invulnerable. (interpreted)
- REQ-64 [state] While Score Multiplier is active, the system shall double score gain and show "x2" in the HUD.
- REQ-65 [event] When the runner crashes while riding a hoverboard, the system shall destroy the board and continue the run.
- REQ-66 [always] Hoverboards shall also be activatable from inventory by double-tap during a run (uses 1 owned hoverboard charge). (interpreted)
- REQ-67 [state] While a power-up is active, the HUD shall show its icon with a draining timer bar.
- REQ-68 [event] When a power-up expires, the system shall remove its icon and effect.
### Collection & economy (F-13, F-14)
- REQ-69 [always] The system shall have characters Rush, Zoe, Kai, Shadow, Nova, Leo; boards Default, Flame, Neon, Dragon, Ice, Galaxy; worlds City, Beach, Snow, Night City, Temple, Lava, priced per storyboard (coins or gems; Leo/Galaxy "Watch Ad" unlock shown but handled by Phase 4 ad adapter — in this phase show "Available soon" disabled state, not a dead button). (interpreted)
- REQ-70 [event] When an affordable locked item is tapped, the system shall show item details with price and a confirmation dialog.
- REQ-71 [event] When purchase is confirmed, the system shall deduct the price and mark the item owned.
- REQ-72 [unwanted] If the balance is insufficient, then the system shall show "Not enough coins" (or gems) with a disabled confirm.
- REQ-73 [event] When an owned item is tapped, the system shall equip it and show "Selected".
- REQ-74 [always] The equipped character, board and world shall be used in the run visuals.
- REQ-75 [always] Worlds shall unlock by player level or price as configured, with a lock icon until unlocked.
- REQ-76 [always] All currency changes shall go through one economy service writing a ledger entry {id, type, amount, currency, reason, timestamp}.
- REQ-77 [unwanted] If a change would make a balance negative, then the economy service shall reject it.
- REQ-78 [unwanted] If a grant uses an already-used event id, then the economy service shall ignore it.
- REQ-79 [always] Gems shall be labelled as premium currency.
### Progression (F-15, F-16, F-17)
- REQ-80 [event] When a run ends, the system shall award XP and level the player up at thresholds, showing a level-up toast.
- REQ-81 [always] Profile shall show name (editable), level, XP bar, total runs, best score, total coins, total gems.
- REQ-82 [always] Statistics shall show all-time and this-week totals: runs, best score, distance, coins, gems, power-ups used, worlds unlocked, characters unlocked.
- REQ-83 [always] Daily missions shall refresh 3–4 missions each local day (e.g., collect 500 coins, use 1 shield, run 2000 m, pick 3 power-ups).
- REQ-84 [always] Missions shall show state: in progress (bar x/y), completed ("Claim"), claimed (check), expired.
- REQ-85 [event] When a completed mission is claimed, the system shall grant its reward exactly once.
- REQ-86 [always] Achievements shall track long-term goals with progress and one-time claimable rewards.
- REQ-87 [always] Daily rewards shall show a 7-day calendar with today highlighted.
- REQ-88 [event] When today's reward is claimed, the system shall grant it once and mark today claimed.
- REQ-89 [unwanted] If today is already claimed, then the system shall show "Come back tomorrow" with a countdown.
- REQ-90 [unwanted] If a day is missed, then the system shall reset the streak to Day 1. (interpreted)
- REQ-91 [unwanted] If the device clock moves backwards, then the system shall not allow a new claim until the clock passes the last claim date. (interpreted)
### Menus, settings, system states (F-18..F-20)
- REQ-92 [always] Main Menu shall match storyboard: player card, coins, gems, Missions, Daily, Shop, Characters, Boards, Worlds, PLAY, bottom Leaderboard/Settings/Inbox.
- REQ-93 [always] Leaderboard button shall open a local "Personal bests" view with a note "Global leaderboard coming with online services". (interpreted; Phase 3 replaces)
- REQ-94 [always] Shop button shall open the Shop with Coins/Gems/Offers tabs showing catalogue items; buying with money shows "Store not available yet" PurchaseStatusDialog in this phase. (interpreted; Phase 4 replaces)
- REQ-95 [always] Settings shall include sound volume, music volume, vibration, language, graphics (Low/Medium/High), notifications, accessibility touch buttons, large text, replay tutorial, privacy, terms, help, reset progress.
- REQ-96 [event] When "Reset progress" is tapped, the system shall require a red confirmation before wiping local data.
- REQ-97 [always] Inbox shall list local messages (welcome, daily reward ready, new item unlocked) with read/unread state and claimable attachments claimed once.
- REQ-98 [always] Help & Support shall show FAQ, Report a problem (opens email to support), and Rate on Play Store link.
- REQ-99 [always] Privacy Policy and Terms screens shall render in-app text.
- REQ-100 [always] Every list screen shall show an EmptyState when it has no items.
- REQ-101 [always] An offline banner (NetworkStatus) shall appear when the device is offline, without blocking gameplay.
- REQ-102 [unwanted] If a save write fails, then the system shall keep the last good save and show "Couldn't save progress" with "Retry".
- REQ-103 [unwanted] If an unexpected render error occurs, then the system shall show an error screen with "Try again" and "Go Home".
- REQ-104 [always] A background music track (original, generated) shall play on menus and runs, controlled by the music setting. (interpreted)
- REQ-105 [always] Game over shall show Watch Ad (+coins) and revive placeholders hidden until Phase 4 (no dead buttons). (interpreted)

## Quality requirements
```
Q-9  Tag: Economy.Integrity
     Scale: negative balances or duplicate grants across 1,000 randomized economy ops
     Meter: jest property test
     Must: 0   Plan: 0
Q-10 Tag: Rewards.DateBoundary
     Scale: incorrect daily claim outcomes across midnight / clock-rollback cases
     Meter: jest with mocked clock, 20 cases
     Must: 0   Plan: 0
Q-11 Tag: Save.Migration
     Scale: Phase-1 saves migrated without loss of coins/best
     Meter: jest migration test
     Must: 100%   Plan: 100%
Q-12 Tag: Visual.Quality
     Scale: all 6 characters, 6 boards, 6 worlds have distinct original art matching storyboard style
     Meter: human/screenshot review
     Must: no missing or stretched art   Plan: storyboard polish
Q-13 Tag: Gameplay.Smoothness
     Scale: FPS with power-ups active
     Meter: dev FPS counter, web preview
     Must: 45   Plan: 60
Q-14 Tag: UX.NoDeadEnds
     Scale: screens without a back/next action
     Meter: tester navigation sweep
     Must: 0   Plan: 0
```

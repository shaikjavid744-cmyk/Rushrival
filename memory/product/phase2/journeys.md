# Phase 2 Journeys — Full Game Content & Progression

Phase 1 journeys JRN-1..JRN-19 remain valid except as superseded below.

- id: JRN-20
  superseded: [JRN-1]
  steps: Fresh install launch.
  expected: Splash → branding → Welcome → Language (7 options) → Age → Terms (Continue disabled until checkbox ticked) → Permissions → Intro (skippable) → Welcome Gift 2,000 coins / 50 gems / 3 power-ups → Claim → tutorial.
- id: JRN-21
  steps: Claim the welcome gift, finish onboarding, relaunch app, and replay the tutorial from Settings.
  expected: Balance shows 2,000 coins and 50 gems once; gift is never offered again; replayed tutorial grants nothing extra.
- id: JRN-22
  steps: In tutorial, do each prompted action; separately try Skip.
  expected: Each step waits for the correct action and advances; Skip goes to character/board intro then "Get Started" → Main Menu.
- id: JRN-23
  steps: Choose "I am under 13".
  expected: Onboarding continues; child mode on (personalised ads off, purchase gate shown when buying).
- id: JRN-24
  steps: On Permissions turn on notifications and deny OS prompt.
  expected: Toggle returns off, message "You can enable notifications later in Settings", flow continues.
- id: JRN-25
  steps: In a run pick up each power-up.
  expected: Magnet pulls coins from other lanes; Shield absorbs one crash; Speed Boost speeds up without crashing; x2 shows in HUD and doubles score gain; Hoverboard absorbs one crash; each shows an icon with draining timer and disappears on expiry.
- id: JRN-26
  steps: Open Characters, tap Zoe (25,000 coins) with 2,000 coins.
  expected: Details with price; "Not enough coins"; confirm disabled; balance unchanged.
- id: JRN-27
  steps: With enough coins buy an item, confirm; then equip it and start a run.
  expected: Balance drops by exact price; item shows "Owned"→ tapping shows "Selected"; run uses the equipped character/board/world visuals.
- id: JRN-28
  steps: Open Worlds.
  expected: City selected; others show locks with unlock condition; unlocked world changes run background.
- id: JRN-29
  steps: Open Daily Rewards and claim today; tap claim again; reopen app.
  expected: Reward granted once; shows "Come back tomorrow" with countdown; no second grant.
- id: JRN-30
  steps: (Clock mocked) skip a day, or move clock back.
  expected: Missed day resets streak to Day 1; clock rollback allows no new claim.
- id: JRN-31
  steps: Open Missions; complete "Run 2000 m" in a run; claim it twice.
  expected: Progress bar updates after the run; "Claim" appears; first claim grants reward, second does nothing (claimed check). Next local day missions refresh and unclaimed ones show expired.
- id: JRN-32
  steps: Open Achievements.
  expected: Progress bars, completed ones claimable once.
- id: JRN-33
  steps: Finish several runs; open Profile and Statistics; edit name.
  expected: Level/XP updates with level-up toast; stats (runs, best, distance, coins, power-ups) correct; new name shows on Main Menu.
- id: JRN-34
  steps: Open Settings; change language to Hindi, graphics Low, music off, large text on, accessibility buttons on.
  expected: Each change applies immediately and persists after restart; missing translations fall back to English.
- id: JRN-35
  steps: Settings → Reset progress → Cancel; then confirm.
  expected: Cancel leaves data intact; confirm wipes data and restarts first-launch flow.
- id: JRN-36
  steps: Open Inbox; open a message with attachment; claim twice.
  expected: Unread badge clears; attachment granted once.
- id: JRN-37
  steps: Open Shop tabs Coins/Gems/Offers; tap a real-money pack.
  expected: Catalogue shows packs with prices; tapping shows "Store not available yet" dialog with OK; no grant.
- id: JRN-38
  steps: Open Leaderboard, Help & Support, Privacy, Terms.
  expected: Each opens with content and a back button; Help FAQ expands; Report a problem opens email.
- id: JRN-39
  steps: Go offline on Main Menu.
  expected: Offline banner shows; PLAY still works.
- id: JRN-40
  steps: Simulate save write failure (dev flag) after a run.
  expected: "Couldn't save progress" with Retry; previous data intact.
- id: JRN-41
  steps: Load a Phase-1 save (version 1) into Phase 2.
  expected: Coins and best score preserved after migration.
- id: JRN-42
  steps: Navigate every screen and press back.
  expected: No dead ends; every screen has back or next; no permanent spinner.
- id: JRN-43
  steps: View Characters, Boards, Worlds, Shop, Missions, Main Menu at 360x640 and 412x915.
  expected: Layout matches storyboard style; all art distinct, not stretched; currency header visible.

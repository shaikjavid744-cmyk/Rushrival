# Phase 1 Journeys — MVP Playable Runner

- id: JRN-1
  steps: Launch the app fresh.
  expected: Splash with Rush Rivals logo + loading bar, then Velactra Game Studio branding, then Main Menu showing "Player", coin balance 0, best score 0, and a gold "PLAY" button. No blank screen at any point.

- id: JRN-2
  steps: On Main Menu tap PLAY.
  expected: 3-2-1-GO countdown, then the runner moves forward automatically in the middle of three lanes; HUD shows score, coins, pause button; score increases over time.

- id: JRN-3
  steps: During a run swipe left, then left again, then right twice (or use arrow keys / accessibility buttons on web preview).
  expected: Runner moves middle→left, stays left on the second left swipe, then moves to middle and right. Never leaves the three lanes.

- id: JRN-4
  steps: During a run swipe up, then swipe down.
  expected: Runner visibly jumps and lands; then visibly slides and stands back up. Low barrier is cleared by jumping, high barrier is cleared by sliding.

- id: JRN-5
  steps: Run through a coin line.
  expected: Each touched coin disappears and the HUD coin count goes up by 1 per coin; score rises by 10 per coin on top of distance.

- id: JRN-6
  steps: Let the runner hit an obstacle.
  expected: Run stops (score stops increasing), crash feedback, then Game Over screen shows score, coins earned, and distance, with "Play Again" and "Home".

- id: JRN-7
  steps: Finish a first run with score > 0.
  expected: Game Over shows "New Best!" badge. A later run with lower score does not show it.

- id: JRN-8
  steps: Finish a run with N coins, tap Home.
  expected: Main Menu balance increased by exactly N and best score updated. Tapping Play Again instead starts a fresh countdown with score 0 and coins 0, and the balance is not added twice.

- id: JRN-9
  steps: Kill and reopen the app after some runs.
  expected: Coin balance, best score and stats are unchanged after restart.

- id: JRN-10
  steps: During a run tap pause, then Resume.
  expected: Game freezes immediately; Pause menu shows "Resume", "Restart", "Home"; after Resume a 3-second countdown, then the run continues with the same score and coins.

- id: JRN-11
  steps: Pause, tap Restart, tap Cancel; tap Restart again, confirm.
  expected: Cancel returns to Pause menu with run intact. Confirm starts a new countdown with score 0. Abandoned run coins are not granted twice. (interpreted: abandoned run coins are not banked)

- id: JRN-12
  steps: Pause, tap Home, cancel; then Home again and confirm.
  expected: Confirmation dialog appears; cancel returns to Pause; confirm returns to Main Menu.

- id: JRN-13
  steps: During a run send app to background, then return.
  expected: Run is paused on return (Pause menu visible), not crashed and not still running.

- id: JRN-14
  steps: On Main Menu press Android back.
  expected: "Exit Game?" dialog with "Exit" (red) and "Cancel"; Cancel dismisses it.

- id: JRN-15
  steps: Play for 2+ minutes.
  expected: Speed visibly increases then caps; every obstacle row has at least one way through; no unavoidable collisions.

- id: JRN-16
  steps: Corrupt the saved data (dev tool or manual storage edit) and relaunch.
  expected: App opens to Main Menu with defaults and toast "Save data was reset"; no crash.

- id: JRN-17
  steps: Turn off network/airplane mode and play a full run.
  expected: Everything in JRN-2..JRN-8 works offline.

- id: JRN-18
  steps: Toggle sound and vibration off on Main Menu, play, restart app.
  expected: No sounds/haptics during the run; toggles stay off after restart.

- id: JRN-19
  steps: View the Main Menu and a run on small (360x640) and tall (412x915) screens.
  expected: Logo, PLAY, HUD and pause button fully visible, not under notch/system bars, art not stretched, matches storyboard style.

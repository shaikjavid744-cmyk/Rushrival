# Phase 1 Requirement — MVP Playable Runner

Version: phase-1. See `../overview.md` for product, architecture, design rules.

## Goal
A player opens Rush Rivals on Android (Expo app), taps PLAY, runs a fair, escalating 3-lane endless run with swipe controls, collects coins, crashes, sees a game-over summary, and plays again — fully offline, with best score and coins saved on device.

## Functional requirements
- REQ-1 [event] When the app launches, the system shall show a splash screen with the Rush Rivals logo and a loading bar.
- REQ-2 [event] When splash loading completes, the system shall show a Velactra Game Studio branding screen for about 1.5 seconds.
- REQ-3 [event] When branding finishes, the system shall open the Main Menu.
- REQ-4 [unwanted] If asset or save initialization fails, then the system shall show an error panel with a "Retry" button.
- REQ-5 [always] The Main Menu shall show the player name "Player", the coin balance, the best score, and a large gold "PLAY" button.
- REQ-6 [event] When the player taps PLAY, the system shall show a 3-2-1-GO countdown.
- REQ-7 [event] When the countdown ends, the system shall start the run with automatic forward movement.
- REQ-8 [always] The run shall have exactly three lanes, with the runner starting in the middle lane.
- REQ-9 [event] When the player swipes left or right, the system shall move the runner one lane in that direction.
- REQ-10 [unwanted] If the runner is in an edge lane and the player swipes outward, then the system shall keep the runner in that lane.
- REQ-11 [event] When the player swipes up, the system shall make the runner jump.
- REQ-12 [event] When the player swipes down, the system shall make the runner slide.
- REQ-13 [unwanted] If swipes arrive faster than the action cooldown, then the system shall buffer at most one next action. (interpreted)
- REQ-14 [always] The track shall spawn three obstacle types: low barrier (jump over), high barrier (slide under), and full blocker/train (change lane).
- REQ-15 [always] The spawner shall leave at least one avoidable path for every obstacle row.
- REQ-16 [always] The track shall place coins in lines and arcs along collectible paths.
- REQ-17 [state] While a run is active, the system shall increase speed gradually up to a capped maximum.
- REQ-18 [event] When the runner touches a coin, the system shall add 1 to the run's coin count.
- REQ-19 [state] While a run is active, the HUD shall show score, coin count and a pause button.
- REQ-20 [always] Score shall equal distance travelled in metres (rounded down) plus 10 per coin. (interpreted)
- REQ-21 [event] When the runner hits an obstacle, the system shall end the run.
- REQ-22 [event] When the run ends, the system shall stop score accumulation.
- REQ-23 [event] When the run ends, the system shall show the Game Over screen with score, coins earned, and distance.
- REQ-24 [event] When the run's score exceeds the saved best, the system shall show a "New Best!" badge.
- REQ-25 [event] When the run ends, the system shall add the run's coins to the saved coin balance exactly once.
- REQ-26 [event] When the player taps "Play Again", the system shall start a new countdown with score and coins reset to 0.
- REQ-27 [event] When the player taps "Home" on Game Over, the system shall return to the Main Menu showing the updated balance and best.
- REQ-28 [event] When the player taps pause, the system shall freeze the game and show the Pause menu with "Resume", "Restart" and "Home".
- REQ-29 [event] When the player taps Resume, the system shall show a 3-second countdown before gameplay continues.
- REQ-30 [event] When the player taps Restart, the system shall ask "Restart run? Progress in this run will be lost." with "Restart" and "Cancel".
- REQ-31 [event] When the player taps Home from Pause, the system shall ask for confirmation before abandoning the run.
- REQ-32 [event] When the app goes to background during a run, the system shall auto-pause the run.
- REQ-33 [event] When the player presses Android back during a run, the system shall open the Pause menu.
- REQ-34 [event] When the player presses Android back on the Main Menu, the system shall show "Exit Game?" with "Exit" and "Cancel".
- REQ-35 [always] The system shall persist best score, coin balance, total runs, total distance and total coins in a versioned local save.
- REQ-36 [unwanted] If the save is corrupt or unreadable, then the system shall restore safe defaults and show the toast "Save data was reset".
- REQ-37 [event] When the runner changes lane, jumps, collects a coin or crashes, the system shall play a short sound and haptic where enabled.
- REQ-38 [unwanted] If audio fails to initialize, then the system shall continue the game silently.
- REQ-39 [always] Gameplay shall work with no network connection.
- REQ-40 [always] The Main Menu shall offer a sound toggle and a vibration toggle that persist. (interpreted)
- REQ-41 [optional] Where accessibility buttons are enabled, the system shall show on-screen left/right/jump/slide buttons. (interpreted; toggle on Main Menu in this phase)

## Quality requirements
```
Q-1  Tag: Gameplay.Smoothness
     Scale: frames per second during a run
     Meter: in-app FPS counter (dev mode) on web preview and mid-range Android, 60s run
     Must: 45   Plan: 60
Q-2  Tag: Input.Responsiveness
     Scale: ms from swipe end to visible lane change start
     Meter: manual/video, 20 swipes
     Must: 120  Plan: 60
Q-3  Tag: Gameplay.Fairness
     Scale: unavoidable obstacle rows per 10,000 generated rows
     Meter: automated spawner unit test
     Must: 0    Plan: 0
Q-4  Tag: Economy.Integrity
     Scale: duplicate coin grants per 100 game-over / restart cycles
     Meter: automated test
     Must: 0    Plan: 0
Q-5  Tag: Save.Durability
     Scale: % of app restarts that keep best score and balance
     Meter: 10 restart trials
     Must: 100  Plan: 100
Q-6  Tag: Visual.Quality
     Scale: art matches storyboard style (cartoon, navy/blue/gold), no stretched or pixelated sprites
     Meter: human
     Must: no stretched/blurry assets   Plan: storyboard-level polish
Q-7  Tag: Device.Layout
     Scale: screen widths where HUD/buttons are fully visible and not under notches
     Meter: screenshots at 360x640, 390x844, 412x915
     Must: all three   Plan: all three + tablets
Q-8  Tag: UX.Learnability
     Scale: seconds for a first-time player to start a run unaided
     Meter: human
     Must: 15   Plan: 5
```

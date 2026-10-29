# Phase 3 Journeys — Backend, Accounts & Online Services

Phase 1–2 journeys remain valid except as superseded.

- id: JRN-44
  steps: As a guest with local progress, open Profile → Sign in → Register with email + 8+ char password → accept linking.
  expected: Account created; local coins/gems/inventory/best appear on server profile (GET /api/v1/me) and on Profile; "Signed in as <email>".
- id: JRN-45
  steps: Register with an existing email; then with a 5-char password.
  expected: "Email already registered"; "Password must be at least 8 characters"; no account created.
- id: JRN-46
  steps: Sign in with wrong password; tap "Continue as guest".
  expected: "Sign-in failed. Check your details and try again."; guest play continues.
- id: JRN-47
  steps: Sign in with Google.
  expected: Emergent Google flow completes; account created/linked; profile shows Google name.
- id: JRN-48
  steps: On a second fresh device/browser with different local progress sign in to the same account.
  expected: Conflict dialog "Keep cloud progress" / "Keep this device's progress" with summaries; chosen side wins; no duplicated currency.
- id: JRN-49
  steps: Forgot password → enter email → enter code from email → new password → sign in.
  expected: Reset email sent; expired/wrong code rejected; new password works.
- id: JRN-50
  steps: Signed in, play an online run and finish.
  expected: Run report accepted; balance on server increases exactly by run coins; leaderboard shows the score.
- id: JRN-51
  steps: Replay the same run report (same Idempotency-Key / run_token) and submit forged reports (impossible score, coin rate, reused token) via API.
  expected: Replay returns original result with no extra grant; forged ones return 400 "run_invalid"; leaderboard unchanged.
- id: JRN-52
  steps: Call protected endpoints with no token and with another user's token.
  expected: 401 and 403 respectively with error shape {error:{code,message}}.
- id: JRN-53
  steps: Signed in, go offline, play 3 runs, claim daily reward, buy an item; reconnect.
  expected: Play works offline; on reconnect queued ops sync in order, "Synced" toast; server balance correct; offline runs not on leaderboard.
- id: JRN-54
  steps: Stop backend / make it return 5xx; open app and Leaderboard.
  expected: "Service unavailable" with Retry on online screens; PLAY still works.
- id: JRN-55
  steps: Set remote config maintenance=true; open app.
  expected: Maintenance screen for online features with "Play offline" working.
- id: JRN-56
  steps: Set min_supported_version above app version; then only latest_version above.
  expected: Blocking "Update required" with "Update now"; then dismissible "Update available" with "Update now" / "Later".
- id: JRN-57
  steps: Open Leaderboard signed in online; switch Daily/Weekly/All Time; then signed out.
  expected: Ranked list with own rank highlighted, paginated; signed out shows "Sign in and go online to see global rankings" + personal bests. No Friends tab.
- id: JRN-58
  steps: Server has an active event; open Events; play the event; claim reward twice.
  expected: Event card with time remaining; event rule applies in run; reward granted once. With no events: "No events right now".
- id: JRN-59
  steps: Help → Report a problem → submit; leaderboard → report a player.
  expected: Ticket number shown; ticket and moderation report exist in DB.
- id: JRN-60
  steps: Server sends an announcement with gem attachment; open Inbox; claim twice, on two devices.
  expected: Message shown; gems granted once total.
- id: JRN-61
  steps: Hit login 11 times in a minute.
  expected: 429 with code "rate_limited".
- id: JRN-62
  steps: Settings → Account → Delete account → type DELETE.
  expected: Account deleted, signed out, server data gone; guest play still works. Typing anything else keeps button disabled.
- id: JRN-63
  steps: Choose "I am under 13" in onboarding, open Profile.
  expected: No sign-up option shown.

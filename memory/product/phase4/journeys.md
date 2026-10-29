# Phase 4 Journeys — Monetization & Diagnostics

Earlier journeys remain valid except as superseded.

- id: JRN-64
  superseded: [JRN-37]
  steps: Open Shop tabs Coins / Gems / Offers in the preview.
  expected: Coin packs, gem packs, Starter Bundle, cosmetic bundles, Remove Ads listed with prices; "TEST MODE" label visible; "Restore purchases" available.
- id: JRN-65
  steps: Buy a gem pack with mock outcome "success".
  expected: "Processing…" → server verify → "Purchase successful"; gems increase exactly by pack amount once.
- id: JRN-66
  steps: Mock outcomes cancel, fail, pending→later purchased.
  expected: "Purchase cancelled" no grant; "Purchase failed" + Retry no grant; "Purchase pending…" no grant until completion, then granted once.
- id: JRN-67
  steps: Send same purchase token twice to the verify API.
  expected: Second returns already-processed; balance unchanged.
- id: JRN-68
  steps: Buy Remove Ads, finish 6 runs, restart app, tap Restore purchases on a fresh session.
  expected: "Already owned" on Remove Ads; no interstitials; "Remove Ads: Active" shown; restore reports 1 restored.
- id: JRN-69
  steps: Server receives a refund/void notification for Remove Ads.
  expected: Entitlement revoked; ledger shows revocation; interstitial eligibility returns.
- id: JRN-70
  steps: Game Over → Watch Ad revive (mock completes).
  expected: TEST MODE ad shown; run resumes from the same point after countdown; second revive shows "Revive limit reached" for ads.
- id: JRN-71
  steps: Game Over → Watch Ad +coins; mock closes early; then completes; then tap again.
  expected: Early close: "Watch the full video to get the reward", no grant; complete: run coins doubled once; again: "Reward already claimed".
- id: JRN-72
  steps: Mock ad load timeout.
  expected: After ~8 s "Ad not available right now" with Try again / No thanks; no permanent spinner.
- id: JRN-73
  steps: Fresh player completes runs 1–7 quickly.
  expected: No interstitial in runs 1–3; at most one after run 6 respecting 180 s gap; never during a run.
- id: JRN-74
  steps: Boards → Galaxy "Watch Ad" unlock.
  expected: Progress counter increments per completed ad; unlocked at target.
- id: JRN-75
  steps: Mock store unavailable.
  expected: "Store unavailable" with Retry; Retry recovers.
- id: JRN-76
  steps: Server verification not configured, buy in native-like flow.
  expected: "We'll finish your purchase shortly"; not acknowledged; nothing granted.
- id: JRN-77
  steps: Child mode → buy gems.
  expected: Parental gate appears before purchase; ads non-personalised.
- id: JRN-78
  steps: Settings → Privacy & ad choices; turn analytics off.
  expected: Consent form re-opens (mock in preview); no analytics events sent while off.
- id: JRN-79
  steps: On failed sign-in tap "Continue as guest". (fixes JRN-46 gap)
  expected: Returns to Main Menu as guest with local progress intact.

# Phase 4 Requirement — Monetization & Diagnostics

Version: phase-4. See `../overview.md` (F-27..F-29). Builds on Phases 1–3 as delivered (Expo app; AdsService/BillingService stubs; server-authoritative wallet with Idempotency-Key; shop showing "Store not available yet"; "Watch Ad" slots disabled "Available soon"; gem revive 5/10 gems max 2/run).

## Goal
Real, honest monetization: AdMob rewarded/interstitial ads and Google Play Billing wired through adapters, server-side purchase verification and entitlement reconciliation, every purchase/ad state shown clearly, and Firebase crash/analytics — all gated behind consent, with clearly labelled MOCK adapters in the web/Expo Go preview.

## Functional requirements
### Adapters & environments
- REQ-149 [always] AdsService and BillingService shall each have a Native adapter (Android dev/release build) and a Mock adapter (web/Expo Go/dev), selected at runtime by capability.
- REQ-150 [state] While the Mock adapter is active, every ad and purchase dialog shall show a visible "TEST MODE — no real ad / no real charge" label.
- REQ-151 [always] Native modules shall be loaded lazily so the web/Expo Go preview never crashes on missing native code.
- REQ-152 [always] AdMob shall use Google's official test ad unit IDs in development; production unit IDs and app ID shall come from build-time env config, never hard-coded live IDs invented by the build. (interpreted)
### Consent
- REQ-153 [event] When the app first needs ads, the system shall run the Google UMP consent flow where required before loading ads.
- REQ-154 [state] While child mode is on or ad personalisation is off, the system shall request non-personalised ads only.
- REQ-155 [always] Settings shall offer "Privacy & ad choices" to re-open consent.
### Rewarded ads (F-27)
- REQ-156 [event] When the player taps "Watch Ad" to revive on Game Over, the system shall show a rewarded ad and revive only after the SDK reports reward earned.
- REQ-157 [event] When the player taps "Watch Ad +coins" on Game Over, the system shall double the run's coins only after reward earned.
- REQ-158 [unwanted] If the ad fails to load within 8 seconds, then the system shall show "Ad not available right now" with "Try again" and "No thanks". (interpreted timeout)
- REQ-159 [unwanted] If the player closes the ad early, then the system shall grant nothing and show "Watch the full video to get the reward".
- REQ-160 [always] Each rewarded grant shall carry a unique reward event id and be granted at most once (server Idempotency-Key when signed in; local ledger when guest).
- REQ-161 [unwanted] If the double-coin reward was already claimed for this run, then the system shall show "Reward already claimed" and disable the button.
- REQ-162 [always] Ad revive shall be limited to 1 per run; after limits, the revive panel shall show "Revive limit reached".
- REQ-163 [always] Leo and Galaxy board "Watch Ad" unlocks shall require a configured number of completed rewarded views (e.g., 5) with a progress counter. (interpreted)
### Interstitials
- REQ-164 [always] Interstitials shall only show between completed runs, never during gameplay, never in the first 3 runs of a new player, at most once every 3 completed runs and at least 180 s apart. (interpreted caps)
- REQ-165 [state] While the player owns Remove Ads, the system shall show no interstitials.
- REQ-166 [always] Rewarded ads stay available to Remove Ads owners (opt-in).
### Billing (F-28)
- REQ-167 [always] The Shop shall show Coins, Gems, Offers tabs: coin packs, gem packs, Starter Bundle, cosmetic bundles, Remove Ads, with localised store prices from Google Play (INR/USD per region) when available.
- REQ-168 [always] Product IDs shall come from one config (catalog + env) using placeholder IDs clearly marked "configure in Play Console". (interpreted)
- REQ-169 [unwanted] If the store is unavailable or products fail to load, then the Shop shall show "Store unavailable" with Retry.
- REQ-170 [event] When the player buys a product, the system shall show "Processing…" until Google Play returns a result.
- REQ-171 [event] When Google Play returns success, the app shall send the purchase token to the server for verification before granting anything.
- REQ-172 [event] When the server verifies a purchase, the system shall grant the entitlement once, then consume (consumables) or acknowledge (non-consumables), and show "Purchase successful".
- REQ-173 [unwanted] If the player cancels, then the system shall show "Purchase cancelled" with no grant.
- REQ-174 [unwanted] If the purchase fails, then the system shall show "Purchase failed" with the reason and "Retry".
- REQ-175 [unwanted] If the purchase is pending, then the system shall show "Purchase pending — you'll get your items when payment completes" and grant only when it becomes purchased.
- REQ-176 [unwanted] If the item is already owned, then the system shall show "Already owned" and disable buy.
- REQ-177 [unwanted] If the same purchase token arrives twice, then the server shall grant nothing the second time (unique index on token).
- REQ-178 [event] When the player taps "Restore purchases", the system shall query owned purchases, verify and restore non-consumables and show the count restored.
- REQ-179 [event] When Google reports a refund or voided purchase (Real-time Developer Notifications / Voided Purchases API), the server shall revoke the entitlement and log a ledger entry.
- REQ-180 [unwanted] If server verification credentials are not configured, then the server shall return "verification_unavailable" and the app shall keep the purchase unacknowledged and show "We'll finish your purchase shortly" (retry on next launch). (interpreted)
- REQ-181 [always] Paid items and gems shall be labelled as paid; no card details stored; child mode shall require a parental confirmation gate before purchase.
- REQ-182 [always] Profile/Settings shall show "Remove Ads: Active" when owned.
### Diagnostics (F-29)
- REQ-183 [always] A central Logger shall record errors with context and forward to Firebase Crashlytics in native builds.
- REQ-184 [state] While analytics consent is off, the system shall send no analytics events.
- REQ-185 [always] Key analytics events (run_start, run_end, purchase, ad_reward, level_up) shall be sent via an AnalyticsService adapter.
- REQ-186 [unwanted] If an SDK fails to initialise, then the system shall log it and continue without that feature.

## Quality requirements
```
Q-21 Tag: Money.NoFreeGrants
     Scale: grants without verified purchase / completed ad
     Meter: pytest + jest adapter tests (mock cancel, fail, pending, duplicate, early close)
     Must: 0   Plan: 0
Q-22 Tag: Money.NoLostPurchases
     Scale: verified purchases not granted after crash/restart mid-flow
     Meter: jest + pytest reconciliation tests
     Must: 0   Plan: 0
Q-23 Tag: Ads.Intrusiveness
     Scale: interstitials shown during gameplay or within caps
     Meter: jest frequency-cap tests
     Must: 0   Plan: 0
Q-24 Tag: Honesty.Labelling
     Scale: mock flows without TEST MODE label
     Meter: E2E
     Must: 0   Plan: 0
Q-25 Tag: Real.Verification
     Scale: real AdMob test ads and Play Billing test purchases on device
     Meter: human (EAS dev build + Play internal testing)
     Must: documented checklist   Plan: verified by owner
```

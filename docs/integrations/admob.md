# AdMob (rewarded + interstitial) — Phase 4

**Status: implemented. NOT verified on device.** Web preview / Expo Go run the Mock adapter. The native AdMob path only runs in an Android dev or release build, which has not been run.

## Required accounts
- A Google AdMob account, with an Android app registered under package `android.package` from `app.json` (`com.emergent.rushrivalsrun.olzash`).
- Two ad units: Rewarded and Interstitial.
- A privacy message (GDPR / US states) under AdMob → Privacy & messaging, so UMP has a form to show.

## Libraries
- `react-native-google-mobile-ads@17.4.0`, via its Expo config plugin (added in `mobile/app.config.js`).
- `expo-dev-client` (dev builds) and `expo-build-properties` (minSdk 24).
- RN 0.88 already ships Kotlin 2.2.0, compileSdk 37 and targetSdk 36.

## Env vars / config (`mobile/app.config.js`)
| Var | Used when | Notes |
|---|---|---|
| `APP_ENV=production` | release builds | Switches off Google's test IDs. The build fails if any ID below is missing; IDs are never invented. |
| `ADMOB_ANDROID_APP_ID` | production | `ca-app-pub-…~…` |
| `ADMOB_REWARDED_ID` | production | `ca-app-pub-…/…` |
| `ADMOB_INTERSTITIAL_ID` | production | `ca-app-pub-…/…` |

- In development, Google's official test IDs are used:
  - App: `ca-app-pub-3940256099942544~3347511713`
  - Rewarded: `…/5224354917`
  - Interstitial: `…/1033173712`
- The resolved IDs are exposed as `Constants.expoConfig.extra.ads`.

## Code map
- **`src/monetization/adsCore.ts`** (pure, jest-tested):
  - `runRewarded`: 8 s load timeout. Returns `earned` only if `EARNED_REWARD` fired before close.
  - `grantOnce` and the interstitial caps.
- **`src/monetization/adsNative.ts`**: native adapter, lazy `require`, null if the module is missing. `adsNative.web.ts` is the web stub.
- **`src/services/ads.ts`**: `AdsService`.
  - Picks the native or Mock adapter.
  - Runs UMP consent before the first ad.
  - Sets `requestNonPersonalizedAdsOnly` in child mode or when ad personalisation is off. Child mode also sets `tagForChildDirectedTreatment`, `tagForUnderAgeOfConsent` and `maxAdContentRating G`.
- **`src/monetization/MonetizationHost.tsx`**: Mock dialogs, each labelled **"TEST MODE — no real ad / no real charge"**. Outcomes: watch to end, close early, load timeout, load error. The outcome is picked **before** loading starts, so the 8 s timer measures only the simulated load.

## Placements and rewards
| Placement | Where | Grant | Idempotency |
|---|---|---|---|
| Revive | Revive panel ("Watch Ad · Revive") | Continue the run. Max **1 ad revive per run**, separate from the gem revive (5, then 10 gems). | Event `adrev:<runId>`. Signed in: `POST /api/v1/ads/reward` (server dedupe on `revive:<run>`). |
| Double coins | Game Over ("Watch Ad · +N coins") | +run coins, once per run. "Reward already claimed" afterwards. | `addbl:<runId>`. Server: once per server run (`double_coins:<run_id>`), coins read from the run's ledger entry, never from the client. |
| Unlock | Collection: Leo (character), Galaxy (board) | Progress counter. The item unlocks at **5** completed views. | `adunl:<item>:<uuid>`. Server increments `ad_progress` and adds the item to inventory at 5. |

- Rewards are granted **only** on outcome `earned`.
- Close early → "Watch the full video to get the reward".
- Timeout or error → "Ad not available right now", with Try again / No thanks (no reward).
- The server caps rewarded grants at 40 per player per day (`ad_reward_cap`).

## Interstitials (REQ-164)
`canShowInterstitial` only allows an interstitial when all of these hold:
- between completed runs (on Play again / Home), never during a run;
- not before the 6th completed run;
- at least 3 runs since the last interstitial;
- at least 180 s since the last interstitial;
- **never with Remove Ads**.

State is kept in `monStore.ad` (local).

## Errors and retry
- A load timeout, no-fill or SDK error is reported to the caller and the user can retry; nothing is granted.
- A consent failure → no ads (rewarded buttons report "not available").

## Security
- Rewards for signed-in players are server-side and idempotent per event or run.
- Guests use a local ledger (`monStore.granted`).
- Server-side verification (SSV) callbacks are **not** configured. AdMob SSV (verify the reward callback signature with Google's public keys) is the recommended hardening before scaling rewarded values.

## Test procedure
1. **Web / Expo Go:** Play → crash → "Watch Ad · Revive". The TEST MODE dialog appears. Try each outcome. "Watch to the end" revives once; a second crash shows "Revive limit reached". Game Over → "Watch Ad · +coins" → coins double once. Collection → Galaxy → watch 5 ads → unlocked.
2. **Android dev build:**
   1. Build with the Publish → build flow (dev client).
   2. Real test ads appear with Google's "Test Ad" label.
   3. Check that the UMP form shows in an EEA region; use the AdMob test device / debug geography.
   4. Check the EARNED_REWARD grant and the 8 s timeout (airplane mode).

## Production verification status
- Not verified on device.
- Not verified with production ad units.
- The UMP form has not been verified with a real message.

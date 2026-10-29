# Android release checklist — Rush Rivals

## Identity and versions (REQ-239, REQ-243)
| Item | Value | Where |
|---|---|---|
| Application ID | `com.velactra.rushrivals` | `mobile/app.json` → `android.package` |
| versionName | `1.0.0` | `mobile/app.json` → `expo.version` |
| versionCode | `1` | `mobile/app.json` → `android.versionCode` |
| minSdk / compileSdk / **targetSdk** | 24 / 37 / **36** | `mobile/app.config.js` (`expo-build-properties`) |

- **targetSdk requirement (checked 2026-09 at developer.android.com/google/play/requirements/target-sdk):** from **31 Aug 2026**, new apps and updates on phones and tablets must target **Android 16 (API 36)** or higher. Extensions are possible until 1 Nov 2026. We target 36.
- **Changing the package name:** you can still change the application ID before the first upload; after that it is permanent. Any `google-services.json` and Google sign-in OAuth client must use the same ID.
- **Bump procedure (every upload):**
  1. Increase `android.versionCode` by 1. It must be strictly greater than any code ever uploaded.
  2. Update `expo.version` using semver: patch for fixes, minor for features.
  3. Commit, then build the production profile.
  4. Optionally set EAS `"appVersionSource": "remote"` with `autoIncrement: true` so EAS manages versionCode instead.

## Config validity (JRN-110) — real output, 2026-09
- `npx expo config --type public` resolves:
  - `package: 'com.velactra.rushrivals'`
  - `versionCode: 1`
  - `version: '1.0.0'`
  - `targetSdkVersion: 36`
- `npx expo prebuild --platform android --no-install` (run in a scratch copy so `/android` isn't committed): **`✔ Finished prebuild`, exit 0**. Generated values:
  - `applicationId 'com.velactra.rushrivals'`, `versionCode 1`, `versionName "1.0.0"`
  - `android.targetSdkVersion=36`, `compileSdkVersion=37`, `minSdkVersion=24`
  - AdMob test app ID meta-data
  - `notification_icon` drawable
  - The unused permissions are removed (`RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, storage, media foreground service).
- `npx expo-doctor`: **20/20 checks passed** (after `npx expo install --fix` aligned the SDK 58 patch versions and removed duplicate native modules).

## Build profiles (REQ-240)
On Emergent, `mobile/eas.json` is **platform-managed**: use **Publish** → generate the Android build, and Emergent's Expo account runs EAS. The intended profiles are in [`eas.profiles.json`](./eas.profiles.json):

| Profile | Output | Ads | Backend |
|---|---|---|---|
| `development` | dev-client debug APK | Google test IDs + mock-allowed backend (`ENV≠production`) | dev URL |
| `preview` | internal-distribution APK | test IDs | staging |
| `production` | **AAB** | real AdMob IDs (`APP_ENV=production`, required) | production (`ENV=production`) |

**Building outside Emergent:** no `EXPO_TOKEN` or Expo account is available in this workspace, so **no cloud build was attempted**. From a clean checkout (Q-37, ≤ 10 commands):
```bash
cd mobile && yarn install
npm i -g eas-cli && eas login                 # owner's Expo account
cp ../docs/release-checklist/eas.profiles.json eas.json   # only when NOT building through Emergent
eas build -p android --profile development    # dev client APK
eas build -p android --profile preview        # internal APK
APP_ENV=production eas build -p android --profile production   # signed AAB
eas submit -p android --profile production    # optional: upload to the internal track
```

## Icons, splash, notification icon (REQ-241) — all original Rush Rivals art
- Launcher: `assets/images/icon.png` (1024², the logo).
- Adaptive icon: `assets/images/adaptive-icon.png` foreground + `#0A1128` background. Prebuild generates the mipmap set.
- Splash: `assets/images/splash-image.png` on `#0A1128`.
- Notification icon: `assets/images/notification-icon.png`, a 96×96 white lightning bolt on transparent (Android requires monochrome), accent `#FF7A1A`.

## Signing (REQ-242)
- **Recommended:** let EAS generate and hold the **upload keystore** (EAS credentials), and enrol in **Play App Signing**. Google then holds the app-signing key, so a lost upload key can be reset through Play support.
- **Back up the upload key:**
  1. Run `eas credentials` → Android → Download keystore.
  2. Store the `.jks`, its passwords and the alias in a password manager or vault, with two owners.
  3. Never commit it. `.gitignore` blocks `*.jks`, `*.keystore`, `*.p12` and `credentials.json`.
- **Supplying your own keystore instead:** `eas credentials` → "Upload a keystore".
- **Play Console:**
  1. Release → Setup → App signing: confirm "Signed by Google Play".
  2. Register the **upload key SHA-1/SHA-256** and the **app-signing SHA** with Google Cloud. Google sign-in and Firebase need both.

## Play Console steps
1. Create the app: name "Rush Rivals", default language, **Game**, **Free**.
2. **Internal testing:**
   - Upload the production AAB and add testers (emails or a Google Group).
   - Install from the opt-in link.
   - Run the device-only list in `../testing/README.md` and fix anything blocking.
3. **Closed testing:**
   - Promote the same AAB.
   - New personal developer accounts need ≥ 12 testers for 14 days before production access.
   - Collect feedback and watch vitals.
4. **Production:** staged rollout (5 % → 20 % → 50 % → 100 %), watching Android vitals at each step.

### Store listing (REQ-244)
Assets are in `../store-assets/`:
- `icon-512.png`
- `feature-graphic-1024x500.png`
- `screenshots/01-…08-*.png`: 8 phone screenshots captured from the real game (web build of the same code, 412×915 @2x). These cover menu, run, train roof, power-up, characters, game over, worlds and shop.
- `listing.md` with the short (71 chars) and full descriptions.

### Data Safety (based on what the app actually does)
| Data type | Collected? | Shared? | Purpose | Notes |
|---|---|---|---|---|
| Email address | Yes, **only if the player creates an account** (optional) | No | Account management, support replies | Website contact form also collects name + email |
| Name (display name) | Yes (in-game name; account) | No | App functionality (leaderboards) | |
| User IDs | Yes (account id) | No | App functionality, fraud prevention | |
| Purchase history | Yes (Google Play purchase token/order id) | No | App functionality (entitlements), fraud prevention | Payment data is handled by Google Play, not the app |
| App interactions / gameplay | Yes (runs, scores, progress for signed-in players) | No | App functionality, anti-cheat | Guests: stored only on device |
| Device or other IDs | **Yes — advertising ID via Google Mobile Ads SDK** | **Yes, with Google (AdMob)** | Advertising, analytics (ad measurement) | Under-13 child mode: non-personalised ads, tagged child-directed |
| Crash logs / diagnostics | Yes **once Firebase is configured** (Crashlytics) | No (processed by Google as service provider) | Analytics / stability | Not active until `google-services.json` is added |
| Messages (support tickets) | Yes (support form/in-app) | No | Customer support | |
| Location, contacts, photos, audio, health, financial info | **No** | — | — | Microphone/storage permissions are explicitly removed |

- Data is **encrypted in transit** (HTTPS only).
- Users can **request deletion**: in the app (Settings → Account → Delete account) and on the web (`/account-deletion`, which uses `/api/v1/public/data-deletion`).
- Collection isn't optional for ad ID on ad-supported builds. Accounts and online features are optional.

### Content rating (IARC questionnaire answers)
- Category: Game.
- Violence: **none**. Crashing into obstacles is cartoon slapstick with no blood and no human-on-human harm.
- No sexual content, profanity, drugs, alcohol or tobacco. No gambling, and no simulated gambling or loot boxes: purchases buy fixed, known items.
- User interaction:
  - **Users can interact?** No chat. Only leaderboard display names are shown, and they are moderated by the admin panel and the report flow.
  - **Shares location?** No.
  - **Digital purchases?** Yes.
- Expected result: **PEGI 3 / ESRB Everyone**.

### Ads declaration
**"Contains ads": Yes.** Ads are rewarded videos (revive, double coins, Leo/Galaxy unlock) and frequency-capped interstitials between runs. Consent goes through Google UMP. Child mode means non-personalised, child-directed ads.

### Target audience
- **13+** is the primary audience.
- The app is **not designed for children**, but it has an **under-13 child mode**: an age gate at onboarding, non-personalised child-directed ads, a parental gate (math challenge) before purchases, and limited online features.
- If you select under-13 age groups in Play Console, the app falls under the **Families policy**. You would then need Families-certified ad SDK settings and a teacher-approved review, so decide this before submitting.

### Privacy policy
`https://<your-domain>/privacy` (website `/privacy`). Must be public, non-PDF and reachable before submission.

## Before each production release
- [ ] All tests green (`../testing/README.md`).
- [ ] The device-only list passes on at least 2 physical devices (low-end Android 8/9 + modern Android 15/16).
- [ ] Backend `ENV=production`, real AdMob IDs, Play service account and RTDN topic configured. Verify a real purchase on the internal track.
- [ ] Android vitals review of the previous release: crash-free ≥ 99.5 %, user-perceived ANR ≤ 0.47 %. Review the top Crashlytics clusters.
- [ ] Remote config: `min_supported_version` / `latest_version` set (admin → Releases).

## Rollback
- **App:** Play Console → halt the staged rollout. You cannot un-publish a versionCode, so ship a fix with a **higher versionCode**. If the build is fine but users must update, raise `min_supported_version` in remote config to force the Update screen.
- **Server-side features:** turn on Maintenance or a feature flag, or roll back the config version (admin). There is no app update needed.
- **Backend:** Emergent Rollback to the previous checkpoint and redeploy (see `../deployment/README.md`).

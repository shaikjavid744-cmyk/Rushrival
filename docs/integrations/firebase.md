# Firebase (Crashlytics + Analytics) — Phase 4

**Status: integrated behind adapters; INACTIVE until you add `google-services.json`. NOT verified on device.**

## Required accounts / files
1. A Firebase project, with an Android app registered for package `com.emergent.rushrivalsrun.olzash` (must match `app.json` → `android.package`).
2. Download **`google-services.json`** (your own file; it is not in the repo) and place it at `mobile/google-services.json`. Alternatively, set the `GOOGLE_SERVICES_JSON` env var to its path.
3. Enable Crashlytics and Google Analytics in the Firebase console.

## How the build stays green without it
- `mobile/app.config.js` adds the `@react-native-firebase/app` and `/crashlytics` config plugins and `android.googleServicesFile` **only if the file exists**. It also sets `extra.firebaseConfigured`.
- Without the file, the native Firebase modules are compiled but never initialised. At startup the app logs **"Firebase not configured"** (`src/services/firebaseNative.ts`; on web, `firebaseNative.web.ts`).
- Packages: `@react-native-firebase/app`, `/crashlytics` and `/analytics` @ 27.1.0 (modular API: `getCrashlytics`, `recordError`, `getAnalytics`, `logEvent`, `setAnalyticsCollectionEnabled`).

## Adapters
- **`src/services/logger.ts` (Logger).** Logs to the console plus Crashlytics `log` / `recordError`. Errors from the SDK itself are swallowed, so a failing SDK never crashes the app.
- **`src/services/analytics.ts` (AnalyticsService).** Events: `run_start`, `run_end`, `purchase`, `ad_reward`, `level_up`.
  - **Nothing is sent while consent is off.** Collection is disabled through `setAnalyticsCollectionEnabled(false)`.
  - Analytics is always off in child mode.
  - The last 50 events are kept in `sentEvents` for QA.

## Consent / settings
- **Settings → Privacy & Ads** contains:
  - the "Usage analytics" toggle (stored in `monStore.analytics`);
  - **"Privacy & ad choices"**, which opens the UMP privacy options form (Mock: a TEST MODE dialog);
  - the ad personalisation mode;
  - Remove Ads status.

## Callbacks / webhooks
None.

## Error and retry handling
- An SDK that fails to initialise is logged once and skipped; gameplay is unaffected.

## Security
- `google-services.json` contains a public API key restricted to your app. Still, don't commit it publicly: use "Save to GitHub" on a private repo, or provide it through the build secrets.

## Test procedure
1. **Without the file:** the build succeeds, and the console shows "Firebase not configured".
2. **With the file (Android dev build):**
   1. Add `mobile/google-services.json` and rebuild.
   2. Trigger a test crash; it should appear in the Crashlytics dashboard (first report after an app restart).
   3. Enable DebugView (`adb shell setprop debug.firebase.analytics.app com.emergent.rushrivalsrun.olzash`) and play a run: you should see `run_start` / `run_end`.
   4. Turn analytics off in Settings, play again: no events.

## Production verification status
Not verified: no `google-services.json` has been provided, and no device build has been made.

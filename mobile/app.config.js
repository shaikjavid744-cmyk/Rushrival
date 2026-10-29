/**
 * Dynamic Expo config layered on app.json (Phase 4).
 * - AdMob: Google's official TEST app/unit IDs unless APP_ENV=production, which requires
 *   ADMOB_ANDROID_APP_ID / ADMOB_REWARDED_ID / ADMOB_INTERSTITIAL_ID (never invented here).
 * - Firebase: plugins are added ONLY when google-services.json exists (user-supplied), so builds
 *   succeed without it and the app logs "Firebase not configured".
 */
const fs = require("fs");
const path = require("path");

const TEST = {
  app: "ca-app-pub-3940256099942544~3347511713",
  rewarded: "ca-app-pub-3940256099942544/5224354917",
  interstitial: "ca-app-pub-3940256099942544/1033173712",
};

module.exports = ({ config }) => {
  const production = process.env.APP_ENV === "production";
  const env = (name, test) => {
    if (!production) return test;
    if (!process.env[name]) throw new Error(`${name} is required for production builds (APP_ENV=production)`);
    return process.env[name];
  };
  const googleServices = process.env.GOOGLE_SERVICES_JSON || "./google-services.json";
  const firebaseConfigured = fs.existsSync(path.resolve(__dirname, googleServices));

  const plugins = [
    ...(config.plugins || []),
    "expo-dev-client",
    // Google Play target API requirement (verified 2026-09): new apps & updates must target Android 16 / API 36 from 2026-08-31.
    ["expo-build-properties", { android: { minSdkVersion: 24, targetSdkVersion: 36, compileSdkVersion: 37 } }],
    ["react-native-google-mobile-ads", { androidAppId: env("ADMOB_ANDROID_APP_ID", TEST.app), iosAppId: process.env.ADMOB_IOS_APP_ID || TEST.app }],
    "expo-iap",
    ...(firebaseConfigured ? ["@react-native-firebase/app", "@react-native-firebase/crashlytics"] : []),
  ];

  return {
    ...config,
    plugins,
    android: { ...config.android, ...(firebaseConfigured ? { googleServicesFile: googleServices } : {}) },
    extra: {
      ...(config.extra || {}),
      ads: {
        testIds: !production,
        rewardedId: env("ADMOB_REWARDED_ID", TEST.rewarded),
        interstitialId: env("ADMOB_INTERSTITIAL_ID", TEST.interstitial),
      },
      firebaseConfigured,
    },
  };
};

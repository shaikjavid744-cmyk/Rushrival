/**
 * Firebase (Crashlytics + Analytics) native bridge, lazy-required. Only active when the build includes
 * the user's google-services.json (app.config.js sets extra.firebaseConfigured); otherwise logs
 * "Firebase not configured" once and every call is a no-op.
 */
import Constants from "expo-constants";

interface FirebaseBridge {
  log(msg: string): void;
  recordError(e: Error, ctx?: Record<string, unknown>): void;
  logEvent(name: string, params?: Record<string, unknown>): void;
  setAnalyticsEnabled(on: boolean): void;
}

let bridge: FirebaseBridge | null | undefined;

export function firebase(): FirebaseBridge | null {
  if (bridge !== undefined) return bridge;
  bridge = null;
  if (!(Constants.expoConfig?.extra as any)?.firebaseConfigured || Constants.executionEnvironment === "storeClient") {
    console.log("[rr] Firebase not configured");
    return bridge;
  }
  try {
    const c = require("@react-native-firebase/crashlytics");
    const a = require("@react-native-firebase/analytics");
    const crash = c.getCrashlytics();
    const an = a.getAnalytics();
    bridge = {
      log: (m) => c.log(crash, m),
      recordError: (e, ctx) => {
        if (ctx) c.log(crash, JSON.stringify(ctx).slice(0, 500));
        c.recordError(crash, e);
      },
      logEvent: (n, p) => void a.logEvent(an, n, p),
      setAnalyticsEnabled: (on) => void a.setAnalyticsCollectionEnabled(an, on),
    };
  } catch (e) {
    console.warn("[rr] Firebase failed to initialise — continuing without it", e);
  }
  return bridge;
}

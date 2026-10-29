/**
 * AnalyticsService (REQ-184/185): Firebase Analytics adapter, gated by the player's analytics consent
 * (Settings → Privacy). While consent is off NOTHING is sent. `sent` keeps the last events for tests/QA.
 */
import { firebase } from "@/src/services/firebaseNative";

export type AnalyticsEvent = "run_start" | "run_end" | "purchase" | "ad_reward" | "level_up";

let enabled = false;
export const sentEvents: { name: AnalyticsEvent; params?: Record<string, unknown> }[] = [];

export const analytics = {
  setConsent(on: boolean) {
    enabled = on;
    firebase()?.setAnalyticsEnabled(on);
  },
  get enabled() {
    return enabled;
  },
  event(name: AnalyticsEvent, params?: Record<string, unknown>) {
    if (!enabled) return;
    sentEvents.push({ name, params });
    if (sentEvents.length > 50) sentEvents.shift();
    firebase()?.logEvent(name, params);
  },
};

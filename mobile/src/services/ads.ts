/**
 * AdsService (Phase 4): Native AdMob adapter on Android dev/release builds, Mock adapter (TEST MODE
 * dialogs) on web / Expo Go. UMP consent runs before the first ad; non-personalised ads in child mode
 * or when ad personalisation is off. Rewards are granted by callers only on outcome "earned".
 */
import Constants from "expo-constants";
import { Platform } from "react-native";

import { afterInterstitialShown, afterRunCompleted, canShowInterstitial, RewardedAdapter, RewardOutcome, runRewarded } from "@/src/monetization/adsCore";
import { createNativeAds } from "@/src/monetization/adsNative";
import { mockBus } from "@/src/monetization/mockBus";
import { monStore } from "@/src/monetization/store";
import { analytics } from "@/src/services/analytics";
import { logger } from "@/src/services/logger";

export type AdPlacement = "revive" | "double_coins" | "unlock";

const native = Platform.OS === "android" && Constants.executionEnvironment !== "storeClient" ? createNativeAds() : null;
let prefs = { child: false, personalised: false };
let consentOk: boolean | null = null;

/** Mock ad: the outcome is picked BEFORE loading starts, so the 8 s timeout never counts the tester's thinking time. */
async function mockRewarded(placement: AdPlacement): Promise<RewardedAdapter> {
  const choice = await mockBus.ask("ad", `Rewarded ad · ${placement.replace("_", " ")}`, [
    { key: "complete", label: "Watch to the end" },
    { key: "early", label: "Close early" },
    { key: "timeout", label: "Simulate load timeout (8 s)" },
    { key: "fail", label: "Simulate load error" },
  ]);
  return {
    async load() {
      if (choice === "timeout") return new Promise<void>(() => undefined); // never loads → 8 s timeout
      if (choice === "fail") throw new Error("no fill");
    },
    async show({ onEarned }) {
      if (choice === "complete") onEarned();
    },
  };
}

export const ads = {
  isMock: !native,
  configure(p: { child: boolean; personalised: boolean }) {
    if (p.child !== prefs.child) consentOk = null;
    prefs = p;
  },
  get nonPersonalised() {
    return prefs.child || !prefs.personalised;
  },
  async ensureConsent(): Promise<boolean> {
    if (consentOk !== null) return consentOk;
    if (native) {
      consentOk = await native.consent(prefs.child).catch((e) => (logger.error(e, { where: "ads.consent" }), false));
    } else {
      if (!monStore.get().consentShown) {
        await mockBus.ask("consent", "Ad consent (Google UMP)", [
          { key: "ok", label: "Consent" },
          { key: "manage", label: "Manage options" },
        ]);
        await monStore.set({ consentShown: true });
      }
      consentOk = true;
    }
    return consentOk;
  },
  async privacyOptions() {
    if (native) return native.privacyOptions().catch((e) => logger.error(e, { where: "ads.privacyOptions" }));
    await mockBus.ask("consent", "Privacy & ad choices (Google UMP)", [
      { key: "ok", label: "Consent" },
      { key: "decline", label: "Do not consent" },
    ]);
  },
  async showRewarded(placement: AdPlacement): Promise<RewardOutcome> {
    if (!(await this.ensureConsent())) return "failed";
    const out = await runRewarded(native ? native.rewarded(this.nonPersonalised) : await mockRewarded(placement));
    if (out === "earned") analytics.event("ad_reward", { placement });
    return out;
  },
  /** Call when a run completes (before Game Over UI). */
  recordRunCompleted() {
    void monStore.set({ ad: afterRunCompleted(monStore.get().ad) });
  },
  /** Between runs only (Play again / Home). Returns true if an interstitial was shown. */
  async maybeShowInterstitial(): Promise<boolean> {
    const s = monStore.get();
    if (!canShowInterstitial(s.ad, Date.now(), { removeAds: s.entitlements.includes("remove_ads"), inRun: false })) return false;
    if (!(await this.ensureConsent())) return false;
    const shown = native ? await native.interstitial(this.nonPersonalised) : (await mockBus.ask("interstitial", "Interstitial ad", [{ key: "close", label: "Close ad" }]), true);
    if (shown) await monStore.set({ ad: afterInterstitialShown(monStore.get().ad, Date.now()) });
    return shown;
  },
};

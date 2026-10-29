/**
 * Native AdMob adapter (react-native-google-mobile-ads 17.x), loaded lazily — this file is only bundled
 * on native (adsNative.web.ts stubs web). Returns null when the native module is missing (Expo Go).
 */
import Constants from "expo-constants";

import { RewardedAdapter } from "./adsCore";

export interface NativeAds {
  consent(child: boolean): Promise<boolean>;
  privacyOptions(): Promise<void>;
  rewarded(nonPersonalised: boolean): RewardedAdapter;
  interstitial(nonPersonalised: boolean): Promise<boolean>;
}

export function createNativeAds(): NativeAds | null {
  let m: any;
  try {
    m = require("react-native-google-mobile-ads");
    if (!m?.default) return null;
  } catch {
    return null;
  }
  const ids = (Constants.expoConfig?.extra as any)?.ads ?? {};
  let initialised = false;

  const loadAd = (ad: any, loaded: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const offs = [
        ad.addAdEventListener(loaded, () => (offs.forEach((o: () => void) => o()), resolve())),
        ad.addAdEventListener(m.AdEventType.ERROR, (e: unknown) => (offs.forEach((o: () => void) => o()), reject(e))),
      ];
      ad.load();
    });

  return {
    async consent(child) {
      try {
        await m.AdsConsent.requestInfoUpdate({ tagForUnderAgeOfConsent: child });
        await m.AdsConsent.loadAndShowConsentFormIfRequired();
        const info = await m.AdsConsent.getConsentInfo();
        if (!info.canRequestAds) return false;
      } catch {
        /* consent service unreachable: the SDK applies the previous session's choice */
      }
      if (!initialised) {
        await m.default().setRequestConfiguration({ tagForChildDirectedTreatment: child, tagForUnderAgeOfConsent: child, maxAdContentRating: child ? m.MaxAdContentRating.G : m.MaxAdContentRating.T });
        await m.default().initialize();
        initialised = true;
      }
      return true;
    },
    async privacyOptions() {
      await m.AdsConsent.showPrivacyOptionsForm();
    },
    rewarded(npa) {
      const ad = m.RewardedAd.createForAdRequest(ids.rewardedId, { requestNonPersonalizedAdsOnly: npa });
      return {
        load: () => loadAd(ad, m.RewardedAdEventType.LOADED),
        show: ({ onEarned }) =>
          new Promise((resolve, reject) => {
            const offs = [
              ad.addAdEventListener(m.RewardedAdEventType.EARNED_REWARD, () => onEarned()),
              ad.addAdEventListener(m.AdEventType.CLOSED, () => (offs.forEach((o: () => void) => o()), resolve())),
              ad.addAdEventListener(m.AdEventType.ERROR, (e: unknown) => (offs.forEach((o: () => void) => o()), reject(e))),
            ];
            ad.show().catch(reject);
          }),
      };
    },
    async interstitial(npa) {
      const ad = m.InterstitialAd.createForAdRequest(ids.interstitialId, { requestNonPersonalizedAdsOnly: npa });
      try {
        await Promise.race([loadAd(ad, m.AdEventType.LOADED), new Promise((_, rej) => setTimeout(rej, 4000))]);
        await new Promise<void>((resolve) => {
          const off = ad.addAdEventListener(m.AdEventType.CLOSED, () => (off(), resolve()));
          ad.show().catch(() => resolve());
        });
        return true;
      } catch {
        return false;
      }
    },
  };
}

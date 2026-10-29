import type { RewardedAdapter } from "./adsCore";

/** Web preview: no native AdMob — the Mock adapter is used. */
export interface NativeAds {
  consent(child: boolean): Promise<boolean>;
  privacyOptions(): Promise<void>;
  rewarded(nonPersonalised: boolean): RewardedAdapter;
  interstitial(nonPersonalised: boolean): Promise<boolean>;
}
export const createNativeAds = (): NativeAds | null => null;

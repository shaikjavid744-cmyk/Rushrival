/** Persisted monetization state (separate from the game save): entitlements, ad caps, unlock progress, consent. */
import { storage } from "@/src/utils/storage";

import { InterstitialState } from "./adsCore";

export interface MonState {
  deviceId: string;
  entitlements: string[];
  granted: string[]; // reward event ids + purchase tokens already applied locally
  ad: InterstitialState;
  adUnlock: Record<string, number>; // "boards:galaxy" -> completed views
  analytics: boolean;
  consentShown: boolean;
}
const KEY = "rr.monetization.v1";
const rid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
const fresh = (): MonState => ({ deviceId: `d${rid()}`, entitlements: [], granted: [], ad: { completedRuns: 0, runsSinceInterstitial: 0, lastInterstitialAt: 0 }, adUnlock: {}, analytics: true, consentShown: false });

let state: MonState = fresh();
let loaded = false;
const subs = new Set<() => void>();

export const monStore = {
  get: () => state,
  loaded: () => loaded,
  async load() {
    try {
      const raw = await storage.getItem<string | null>(KEY, null);
      if (raw) state = { ...fresh(), ...JSON.parse(raw) };
    } catch {
      /* fresh state */
    }
    loaded = true;
    await this.set({});
  },
  async set(patch: Partial<MonState>) {
    state = { ...state, ...patch };
    subs.forEach((f) => f());
    await storage.setItem(KEY, JSON.stringify(state));
  },
  subscribe(f: () => void) {
    subs.add(f);
    return () => void subs.delete(f);
  },
  has: (ent: string) => state.entitlements.includes(ent),
  /** Local idempotency ledger: returns false if this id was already applied. */
  markGranted(id: string): boolean {
    if (state.granted.includes(id)) return false;
    void monStore.set({ granted: [...state.granted.slice(-499), id] });
    return true;
  },
};

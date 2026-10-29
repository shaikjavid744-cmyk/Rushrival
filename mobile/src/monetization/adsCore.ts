/** Pure ad logic (jest-tested): rewarded flow with load timeout, interstitial frequency caps. */
export type RewardOutcome = "earned" | "closed_early" | "timeout" | "failed";

export interface RewardedAdapter {
  /** Resolves when an ad is ready, rejects on load error (may never settle → timeout). */
  load(): Promise<void>;
  /** Shows the ad; must call onEarned only on the SDK's EARNED_REWARD; resolves when closed. */
  show(cb: { onEarned: () => void }): Promise<void>;
}

export const AD_LOAD_TIMEOUT_MS = 8000;
const TIMEOUT = Symbol("timeout");

export async function runRewarded(a: RewardedAdapter, timeoutMs = AD_LOAD_TIMEOUT_MS): Promise<RewardOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([a.load(), new Promise((_, rej) => (timer = setTimeout(() => rej(TIMEOUT), timeoutMs)))]);
  } catch (e) {
    return e === TIMEOUT ? "timeout" : "failed";
  } finally {
    clearTimeout(timer);
  }
  let earned = false;
  try {
    await a.show({ onEarned: () => (earned = true) });
  } catch {
    return earned ? "earned" : "failed";
  }
  return earned ? "earned" : "closed_early";
}

/** Grants each reward event id at most once (duplicate SDK callbacks / retries are no-ops). */
export function grantOnce(granted: Set<string>, eventId: string, grant: () => void): boolean {
  if (granted.has(eventId)) return false;
  granted.add(eventId);
  grant();
  return true;
}

export interface InterstitialState {
  completedRuns: number;
  runsSinceInterstitial: number;
  lastInterstitialAt: number;
}
/** REQ-164: only between completed runs, never in a new player's first runs, ≤1 per 3 runs, ≥180 s apart. */
export const INTERSTITIAL_CAPS = { firstEligibleRun: 6, everyRuns: 3, minGapMs: 180_000 };

export function canShowInterstitial(s: InterstitialState, now: number, o: { removeAds: boolean; inRun: boolean }): boolean {
  if (o.removeAds || o.inRun) return false;
  if (s.completedRuns < INTERSTITIAL_CAPS.firstEligibleRun) return false;
  if (s.runsSinceInterstitial < INTERSTITIAL_CAPS.everyRuns) return false;
  return now - s.lastInterstitialAt >= INTERSTITIAL_CAPS.minGapMs;
}
export const afterRunCompleted = (s: InterstitialState): InterstitialState => ({ ...s, completedRuns: s.completedRuns + 1, runsSinceInterstitial: s.runsSinceInterstitial + 1 });
export const afterInterstitialShown = (s: InterstitialState, now: number): InterstitialState => ({ ...s, runsSinceInterstitial: 0, lastInterstitialAt: now });

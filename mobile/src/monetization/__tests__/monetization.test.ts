/**
 * Phase 4 monetization logic: rewarded-ad verification (grant only on EARNED_REWARD, once per event id),
 * interstitial frequency caps (REQ-164), billing state machine (verify → grant → finish; duplicate callbacks).
 */
import { afterInterstitialShown, afterRunCompleted, canShowInterstitial, grantOnce, InterstitialState, RewardedAdapter, runRewarded } from "../adsCore";
import { AdapterPurchaseResult, BillingAdapter, BillingEngine, StorePurchase, VerifyResult } from "../billingCore";

jest.useFakeTimers();

const adapter = (o: { load?: "ok" | "fail" | "never"; earn?: boolean; earnTwice?: boolean; showThrows?: boolean }): RewardedAdapter => ({
  load: () => (o.load === "fail" ? Promise.reject(new Error("no fill")) : o.load === "never" ? new Promise(() => undefined) : Promise.resolve()),
  show: async ({ onEarned }) => {
    if (o.earn) onEarned();
    if (o.earnTwice) onEarned();
    if (o.showThrows) throw new Error("show failed");
  },
});

describe("rewarded ads", () => {
  it("earned only when the SDK fires EARNED_REWARD", async () => {
    await expect(runRewarded(adapter({ earn: true }))).resolves.toBe("earned");
    await expect(runRewarded(adapter({ earn: false }))).resolves.toBe("closed_early");
  });
  it("load error -> failed; show error before reward -> failed; after reward -> still earned", async () => {
    await expect(runRewarded(adapter({ load: "fail" }))).resolves.toBe("failed");
    await expect(runRewarded(adapter({ showThrows: true }))).resolves.toBe("failed");
    await expect(runRewarded(adapter({ earn: true, showThrows: true }))).resolves.toBe("earned");
  });
  it("8 s load timeout", async () => {
    const p = runRewarded(adapter({ load: "never" }));
    jest.advanceTimersByTime(7999);
    await Promise.resolve();
    jest.advanceTimersByTime(1);
    await expect(p).resolves.toBe("timeout");
  });
  it("duplicate EARNED callbacks / repeated event ids grant once", async () => {
    const granted = new Set<string>();
    let coins = 0;
    const grant = () => (coins += 100);
    expect(await runRewarded(adapter({ earnTwice: true }))).toBe("earned");
    expect(grantOnce(granted, "addbl:run1", grant)).toBe(true);
    expect(grantOnce(granted, "addbl:run1", grant)).toBe(false);
    expect(coins).toBe(100);
  });
});

describe("interstitial frequency caps", () => {
  const base: InterstitialState = { completedRuns: 0, runsSinceInterstitial: 0, lastInterstitialAt: 0 };
  const T0 = 10_000_000;
  it("never during a new player's first runs, never in-run, never with Remove Ads", () => {
    let s = base;
    const shownAfter: number[] = [];
    let t = T0;
    for (let run = 1; run <= 7; run++) {
      s = afterRunCompleted(s);
      t += 60_000;
      if (canShowInterstitial(s, t, { removeAds: false, inRun: false })) {
        shownAfter.push(run);
        s = afterInterstitialShown(s, t);
      }
    }
    expect(shownAfter).toEqual([6]); // none in runs 1–3, at most one by run 7
    const eligible = { completedRuns: 10, runsSinceInterstitial: 5, lastInterstitialAt: 0 };
    expect(canShowInterstitial(eligible, T0, { removeAds: false, inRun: true })).toBe(false);
    expect(canShowInterstitial(eligible, T0, { removeAds: true, inRun: false })).toBe(false);
    expect(canShowInterstitial(eligible, T0, { removeAds: false, inRun: false })).toBe(true);
  });
  it("needs 3 runs and 180 s between interstitials", () => {
    const s = { completedRuns: 9, runsSinceInterstitial: 3, lastInterstitialAt: T0 };
    expect(canShowInterstitial(s, T0 + 179_000, { removeAds: false, inRun: false })).toBe(false);
    expect(canShowInterstitial(s, T0 + 180_000, { removeAds: false, inRun: false })).toBe(true);
    expect(canShowInterstitial({ ...s, runsSinceInterstitial: 2 }, T0 + 999_999, { removeAds: false, inRun: false })).toBe(false);
  });
});

describe("billing state machine", () => {
  const consumable = (id: string) => id.startsWith("gems");
  function setup(result: AdapterPurchaseResult | (() => Promise<AdapterPurchaseResult>), verify?: (p: StorePurchase) => Promise<VerifyResult>, connect = true) {
    const finished: { token: string; consumable: boolean }[] = [];
    const grants: string[] = [];
    let late: ((p: StorePurchase) => void) | null = null;
    const owned: StorePurchase[] = [];
    const a: BillingAdapter = {
      mock: true,
      connect: async () => connect,
      prices: async () => ({}),
      purchase: typeof result === "function" ? result : async () => result,
      finish: async (p, c) => void finished.push({ token: p.token, consumable: c }),
      owned: async () => owned,
      onLatePurchase: (fn) => (late = fn),
    };
    const v = verify ?? (async (p: StorePurchase) => ({ status: "verified" as const, consumable: consumable(p.productId), entitlements: [] }));
    const engine = new BillingEngine(a, v, (p) => grants.push(p.token), () => false, consumable, 1000);
    return { engine, finished, grants, owned, late: () => late };
  }
  const P = (id = "gems_100", token = "t1", state: "purchased" | "pending" = "purchased"): StorePurchase => ({ productId: id, token, state });

  it("success: verify -> grant -> consume (consumable) / acknowledge (non-consumable)", async () => {
    const c = setup({ status: "purchased", purchase: P() });
    expect(await c.engine.buy("gems_100")).toEqual({ kind: "success", productId: "gems_100" });
    expect(c.grants).toEqual(["t1"]);
    expect(c.finished).toEqual([{ token: "t1", consumable: true }]);
    const n = setup({ status: "purchased", purchase: P("remove_ads", "t2") });
    await n.engine.buy("remove_ads");
    expect(n.finished).toEqual([{ token: "t2", consumable: false }]);
  });
  it("cancelled / failed / store unavailable grant nothing", async () => {
    expect((await setup({ status: "cancelled" }).engine.buy("gems_100")).kind).toBe("cancelled");
    const f = setup({ status: "failed", reason: "declined" });
    expect(await f.engine.buy("gems_100")).toEqual({ kind: "failed", reason: "declined" });
    expect(f.grants).toEqual([]);
    expect((await setup({ status: "cancelled" }, undefined, false).engine.buy("gems_100")).kind).toBe("store_unavailable");
  });
  it("adapter 'unavailable' maps to store_unavailable on the first attempt", async () => {
    expect((await setup({ status: "unavailable" }).engine.buy("gems_100")).kind).toBe("store_unavailable");
  });
  it("timeout 0 (real Play sheet) never reports a false 'nothing was charged'", async () => {
    let resolve: (r: AdapterPurchaseResult) => void = () => undefined;
    const a: BillingAdapter = { mock: false, connect: async () => true, prices: async () => ({}), purchase: () => new Promise((r) => (resolve = r)), finish: async () => undefined, owned: async () => [], onLatePurchase: () => undefined };
    const e = new BillingEngine(a, async () => ({ status: "verified", consumable: true, entitlements: [] }), () => undefined, () => false, () => true, 0);
    const p = e.buy("gems_100");
    jest.advanceTimersByTime(10 * 60_000);
    await Promise.resolve();
    resolve({ status: "purchased", purchase: P() });
    expect((await p).kind).toBe("success");
  });
  it("purchase timeout -> failed with retry message", async () => {
    const c = setup(() => new Promise(() => undefined));
    const p = c.engine.buy("gems_100");
    await Promise.resolve();
    jest.advanceTimersByTime(1000);
    const r = await p;
    expect(r.kind).toBe("failed");
  });
  it("pending: no grant until completion, then granted once", async () => {
    const c = setup({ status: "pending", purchase: P("gems_100", "tp", "pending") });
    expect((await c.engine.buy("gems_100")).kind).toBe("pending");
    expect(c.grants).toEqual([]);
    expect((await c.engine.handle(P("gems_100", "tp"))).kind).toBe("success");
    expect(c.grants).toEqual(["tp"]);
  });
  it("never grants when verification is unavailable; leaves purchase unfinished (deferred)", async () => {
    const c = setup({ status: "purchased", purchase: P() }, async () => Promise.reject({ code: "verification_unavailable" }));
    expect((await c.engine.buy("gems_100")).kind).toBe("deferred");
    expect(c.grants).toEqual([]);
    expect(c.finished).toEqual([]);
  });
  it("server rejection (e.g. mock token in production) fails without grant", async () => {
    const c = setup({ status: "purchased", purchase: P() }, async () => Promise.reject({ code: "mock_token_rejected", message: "Test purchases are not accepted in production" }));
    expect(await c.engine.buy("gems_100")).toEqual({ kind: "failed", reason: "Test purchases are not accepted in production" });
    expect(c.grants).toEqual([]);
  });
  it("duplicate store callbacks for one token: processed once while in flight", async () => {
    let release: (v: VerifyResult) => void = () => undefined;
    let calls = 0;
    const c = setup({ status: "cancelled" }, () => {
      calls++;
      return new Promise((r) => (release = r));
    });
    const first = c.engine.handle(P());
    const dup = await c.engine.handle(P());
    expect(dup.kind).toBe("processing");
    release({ status: "verified", consumable: true, entitlements: [] });
    expect((await first).kind).toBe("success");
    expect(calls).toBe(1);
    expect(c.grants).toEqual(["t1"]);
  });
  it("reconcile finishes unacknowledged purchases on launch; restore only non-consumables", async () => {
    const c = setup({ status: "cancelled" });
    c.owned.push(P("gems_100", "a"), P("remove_ads", "b"));
    expect(await c.engine.reconcile()).toBe(2);
    const r = setup({ status: "cancelled" });
    r.owned.push(P("gems_100", "a"), P("remove_ads", "b"));
    expect(await r.engine.restore()).toBe(1);
    expect(r.grants).toEqual(["b"]);
  });
  it("revoked purchase is finished but not granted", async () => {
    const c = setup({ status: "purchased", purchase: P("remove_ads", "rv") }, async () => ({ status: "already_processed", consumable: false, entitlements: [], revoked: true }));
    expect((await c.engine.buy("remove_ads")).kind).toBe("success");
    expect(c.grants).toEqual([]);
  });
});

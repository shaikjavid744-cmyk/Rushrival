/**
 * BillingService (Phase 4): Native Google Play Billing (expo-iap) on Android builds, Mock adapter
 * (TEST MODE dialogs, "mock_" tokens accepted by the server only when ENV=development) on web / Expo Go.
 * Everything is granted only after POST /api/v1/purchases/verify succeeds.
 */
import Constants from "expo-constants";
import { Platform } from "react-native";

import { BillingAdapter, BillingEngine, PURCHASE_TIMEOUT_MS, StorePurchase, VerifyResult } from "@/src/monetization/billingCore";
import { createNativeBilling } from "@/src/monetization/billingNative";
import { mockBus } from "@/src/monetization/mockBus";
import { productById, PRODUCTS } from "@/src/monetization/products";
import { monStore } from "@/src/monetization/store";
import { online, uid } from "@/src/online/online";
import { analytics } from "@/src/services/analytics";

const nativeAdapter = Platform.OS === "android" && Constants.executionEnvironment !== "storeClient" ? createNativeBilling() : null;

/** Mock Play store: outcomes picked in a TEST MODE dialog. Pending purchases can be completed later. */
function createMockBilling(): BillingAdapter & { completePending(): void; pendingCount(): number; setStoreDown(v: boolean): void } {
  let storeDown = false;
  let late: ((p: StorePurchase) => void) | null = null;
  const pending: StorePurchase[] = [];
  const owned: StorePurchase[] = [];
  return {
    mock: true,
    async connect() {
      return !storeDown;
    },
    async prices() {
      return {};
    },
    async purchase(productId) {
      const k = await mockBus.ask("purchase", `Google Play · ${productById(productId)?.title ?? productId}`, [
        { key: "success", label: "Pay (success)" },
        { key: "cancel", label: "Cancel" },
        { key: "fail", label: "Payment declined" },
        { key: "pending", label: "Pending payment" },
        { key: "timeout", label: "No response (timeout)" },
        { key: "unavailable", label: "Store unavailable" },
      ]);
      const p: StorePurchase = { productId, token: `mock_${uid()}`, state: "purchased" };
      if (k === "cancel") return { status: "cancelled" };
      if (k === "fail") return { status: "failed", reason: "Your payment method was declined (test)." };
      if (k === "timeout") return new Promise(() => undefined);
      if (k === "unavailable") {
        storeDown = true;
        return { status: "unavailable" };
      }
      if (k === "pending") {
        pending.push({ ...p, state: "pending" });
        return { status: "pending", purchase: { ...p, state: "pending" } };
      }
      if (!productById(productId)?.consumable) owned.push(p);
      return { status: "purchased", purchase: p };
    },
    async finish() {},
    async owned() {
      return [...owned];
    },
    onLatePurchase(fn) {
      late = fn;
    },
    completePending() {
      const p = pending.shift();
      if (!p) return;
      const done = { ...p, state: "purchased" as const };
      if (!productById(p.productId)?.consumable) owned.push(done);
      late?.(done);
    },
    pendingCount: () => pending.length,
    setStoreDown(v) {
      storeDown = v;
    },
  };
}

const mock = nativeAdapter ? null : createMockBilling();
const adapter: BillingAdapter = nativeAdapter ?? mock!;

const verify = async (p: StorePurchase): Promise<VerifyResult> => {
  online.deviceId = monStore.get().deviceId;
  const r = await online.request<VerifyResult & { entitlements: string[] }>("/purchases/verify", { method: "POST", body: { product_id: p.productId, purchase_token: p.token } });
  await monStore.set({ entitlements: r.entitlements ?? monStore.get().entitlements });
  return r;
};

/** Set by MonetizationHost: applies a verified grant to the local save (idempotent per token). */
let applyGrant: (p: StorePurchase, v: VerifyResult) => void = () => undefined;
let lateListener: ((s: string) => void) | null = null;

const owns = (productId: string) => (productById(productId)?.grant.entitlements ?? []).some((e) => monStore.has(e));
export const engine = new BillingEngine(adapter, verify, (p, v) => applyGrant(p, v), owns, (id) => !!productById(id)?.consumable, adapter.mock ? PURCHASE_TIMEOUT_MS : 0);

adapter.onLatePurchase(async (p) => {
  const st = await engine.handle(p);
  lateListener?.(st.kind);
});

export const billing = {
  isMock: adapter.mock,
  mock,
  setGrantHandler(fn: typeof applyGrant) {
    applyGrant = fn;
  },
  onLateResult(fn: ((kind: string) => void) | null) {
    lateListener = fn;
  },
  owns,
  async prices(): Promise<Record<string, string> | null> {
    if (!(await adapter.connect().catch(() => false))) return null;
    return adapter.prices(PRODUCTS.map((p) => p.id)).catch(() => ({}));
  },
  async buy(productId: string) {
    const st = await engine.buy(productId);
    if (st.kind === "success") analytics.event("purchase", { product_id: productId });
    return st;
  },
  restore: () => engine.restore(),
  reconcile: () => engine.reconcile(),
  /** Pull server entitlements (refunds revoke Remove Ads → interstitial eligibility returns). */
  async syncEntitlements() {
    online.deviceId = monStore.get().deviceId;
    try {
      const r = await online.request<{ entitlements: string[] }>("/entitlements");
      await monStore.set({ entitlements: r.entitlements });
    } catch {
      /* offline: keep cached entitlements */
    }
  },
};

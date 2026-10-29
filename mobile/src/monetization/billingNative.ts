/**
 * Native Google Play Billing adapter (expo-iap 6.x / Play Billing 8), loaded lazily — only bundled on
 * native (billingNative.web.ts stubs web). Returns null when the native module is missing (Expo Go).
 */
import { AdapterPurchaseResult, BillingAdapter, StorePurchase } from "./billingCore";

export function createNativeBilling(): BillingAdapter | null {
  let iap: any;
  try {
    iap = require("expo-iap");
    if (!iap?.initConnection) return null;
  } catch {
    return null;
  }
  let connected = false;
  let waiter: { id: string; resolve: (r: AdapterPurchaseResult) => void } | null = null;
  let late: ((p: StorePurchase) => void) | null = null;
  const map = (p: any): StorePurchase => ({ productId: p.productId ?? p.id, token: p.purchaseToken ?? p.purchaseTokenAndroid, state: p.purchaseState === "pending" ? "pending" : "purchased", raw: p });

  const attach = () => {
    iap.purchaseUpdatedListener((p: any) => {
      const sp = map(p);
      if (waiter && waiter.id === sp.productId) {
        waiter.resolve({ status: sp.state, purchase: sp });
        waiter = null;
      } else late?.(sp);
    });
    iap.purchaseErrorListener((e: any) => {
      if (!waiter) return;
      waiter.resolve(iap.isUserCancelledError?.(e) || e?.code === "user-cancelled" ? { status: "cancelled" } : { status: "failed", reason: e?.message ?? "Purchase failed" });
      waiter = null;
    });
  };

  return {
    mock: false,
    async connect() {
      if (connected) return true;
      connected = !!(await iap.initConnection());
      if (connected) attach();
      return connected;
    },
    async prices(ids) {
      const list: any[] = (await iap.fetchProducts({ skus: ids, type: "in-app" })) ?? [];
      return Object.fromEntries(list.map((p) => [p.id ?? p.productId, p.displayPrice]));
    },
    purchase(productId) {
      return new Promise((resolve) => {
        waiter = { id: productId, resolve };
        iap.requestPurchase({ request: { google: { skus: [productId] } }, type: "in-app" }).catch((e: any) => {
          if (!waiter) return;
          waiter = null;
          resolve(iap.isUserCancelledError?.(e) || e?.code === "user-cancelled" ? { status: "cancelled" } : { status: "failed", reason: e?.message ?? "Purchase failed" });
        });
      });
    },
    async finish(p, consumable) {
      await iap.finishTransaction({ purchase: p.raw, isConsumable: consumable });
    },
    async owned() {
      return ((await iap.getAvailablePurchases()) ?? []).map(map).filter((p: StorePurchase) => !!p.token);
    },
    onLatePurchase(fn) {
      late = fn;
    },
  };
}

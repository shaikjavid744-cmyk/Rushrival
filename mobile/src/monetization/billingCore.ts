/**
 * Pure billing state machine (jest-tested). Grant ONLY after server verification, then
 * consume (consumable) / acknowledge (non-consumable). Unverifiable purchases stay unfinished
 * ("deferred") and are reconciled on the next launch.
 */
export interface StorePurchase {
  productId: string;
  token: string;
  state: "purchased" | "pending";
  raw?: unknown;
}
export type AdapterPurchaseResult = { status: "purchased" | "pending"; purchase: StorePurchase } | { status: "cancelled" } | { status: "unavailable" } | { status: "failed"; reason: string };

export interface BillingAdapter {
  readonly mock: boolean;
  connect(): Promise<boolean>;
  prices(ids: string[]): Promise<Record<string, string>>;
  purchase(productId: string): Promise<AdapterPurchaseResult>;
  finish(p: StorePurchase, consumable: boolean): Promise<void>;
  /** Unfinished + owned purchases known to the store (restore / reconcile). */
  owned(): Promise<StorePurchase[]>;
  /** Purchases arriving later (pending → purchased, or redelivered on launch). */
  onLatePurchase(fn: (p: StorePurchase) => void): void;
}

export interface VerifyResult {
  status: "verified" | "already_processed" | "pending";
  consumable: boolean;
  entitlements: string[];
  revoked?: boolean;
}
export type Verifier = (p: StorePurchase) => Promise<VerifyResult>;

export type PurchaseState =
  | { kind: "processing" }
  | { kind: "success"; productId: string }
  | { kind: "cancelled" }
  | { kind: "failed"; reason: string }
  | { kind: "pending" }
  | { kind: "already_owned" }
  | { kind: "store_unavailable" }
  | { kind: "deferred" }; // paid, but the server couldn't verify yet → "We'll finish your purchase shortly"

export const PURCHASE_TIMEOUT_MS = 30_000;
const DEFER_CODES = new Set(["verification_unavailable", "network", "timeout", "internal_error", "rate_limited"]);

export class BillingEngine {
  private inFlight = new Set<string>();
  constructor(
    private adapter: BillingAdapter,
    private verify: Verifier,
    /** Apply the verified grant locally. Must itself be idempotent per token. */
    private onGrant: (p: StorePurchase, v: VerifyResult) => void,
    private isOwned: (productId: string) => boolean,
    private isConsumable: (productId: string) => boolean,
    private timeoutMs = PURCHASE_TIMEOUT_MS,
  ) {}

  async buy(productId: string): Promise<PurchaseState> {
    if (!this.isConsumable(productId) && this.isOwned(productId)) return { kind: "already_owned" };
    let ok = false;
    try {
      ok = await this.adapter.connect();
    } catch {
      ok = false;
    }
    if (!ok) return { kind: "store_unavailable" };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let r: AdapterPurchaseResult;
    try {
      // The timeout guards only adapters that can hang without user input (mock / tests). On a real device the
      // Google Play sheet is user-driven; a timeout there could say "nothing was charged" and be wrong.
      const racers: Promise<AdapterPurchaseResult>[] = [this.adapter.purchase(productId)];
      if (this.timeoutMs > 0) racers.push(new Promise<AdapterPurchaseResult>((res) => (timer = setTimeout(() => res({ status: "failed", reason: "Google Play didn't respond. Nothing was charged." }), this.timeoutMs))));
      r = await Promise.race(racers);
    } catch (e) {
      r = { status: "failed", reason: (e as Error)?.message || "Unknown error" };
    } finally {
      clearTimeout(timer);
    }
    if (r.status === "cancelled") return { kind: "cancelled" };
    if (r.status === "unavailable") return { kind: "store_unavailable" };
    if (r.status === "failed") return { kind: "failed", reason: r.reason };
    return this.handle(r.purchase);
  }

  /** Verify → grant once → finish. Duplicate callbacks for the same token are ignored while in flight. */
  async handle(p: StorePurchase): Promise<PurchaseState> {
    if (p.state === "pending") return { kind: "pending" };
    if (this.inFlight.has(p.token)) return { kind: "processing" };
    this.inFlight.add(p.token);
    try {
      let v: VerifyResult;
      try {
        v = await this.verify(p);
      } catch (e) {
        const code = (e as { code?: string })?.code ?? "network";
        if (DEFER_CODES.has(code) || (e as { status?: number })?.status === 0) return { kind: "deferred" };
        return { kind: "failed", reason: (e as Error)?.message || code };
      }
      if (v.status === "pending") return { kind: "pending" };
      if (!v.revoked) this.onGrant(p, v);
      await this.adapter.finish(p, v.consumable).catch(() => undefined); // retried by reconcile()
      return { kind: "success", productId: p.productId };
    } finally {
      this.inFlight.delete(p.token);
    }
  }

  /** On launch: finish anything the store still reports (crash/kill mid-flow, deferred verification). */
  async reconcile(): Promise<number> {
    if (!(await this.adapter.connect().catch(() => false))) return 0;
    let n = 0;
    for (const p of await this.adapter.owned().catch(() => [] as StorePurchase[])) {
      if ((await this.handle(p)).kind === "success") n++;
    }
    return n;
  }

  /** Restore purchases: re-verify owned non-consumables; returns the number restored. */
  async restore(): Promise<number | "store_unavailable"> {
    if (!(await this.adapter.connect().catch(() => false))) return "store_unavailable";
    let n = 0;
    for (const p of await this.adapter.owned().catch(() => [] as StorePurchase[])) {
      if (this.isConsumable(p.productId) || p.state !== "purchased") continue;
      if ((await this.handle(p)).kind === "success") n++;
    }
    return n;
  }
}

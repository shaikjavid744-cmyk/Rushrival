// Server-published catalogue (Phase 6 admin → GET /api/v1/catalog): prices/unlocks + daily rewards.
// Applied IN PLACE onto the bundled tables so every screen and the local economy see the same values.
// Offline / first launch: the bundled defaults in config/catalog.ts stay authoritative; the last published
// version is cached so a later offline launch keeps the operator's prices.
import { BOARDS, CHARACTERS, DAILY_REWARDS, Price, WORLDS, type CatalogItem, type Currency } from "@/src/config/catalog";
import { storage } from "@/src/utils/storage";

type ServerPrice = null | "ad" | { currency: Currency; amount: number };
export interface LiveCatalog {
  version: number;
  items: Record<string, Record<string, ServerPrice>>;
  unlock_levels?: Record<string, Record<string, number>>;
  daily_rewards: Record<string, number>[];
}

const KEY = "rr.liveCatalog.v1";
const TABLES: Record<string, CatalogItem[]> = { character: CHARACTERS, board: BOARDS, world: WORLDS };
const BUNDLED = {
  items: Object.fromEntries(Object.entries(TABLES).map(([k, t]) => [k, t.map((i) => ({ id: i.id, price: i.price, unlockLevel: i.unlockLevel }))])),
  daily: DAILY_REWARDS.map((d) => ({ ...d })),
};
export let liveVersion = 0;

const toPrice = (p: ServerPrice): Price => (p === null ? null : p === "ad" ? { ad: true } : { currency: p.currency, amount: p.amount });

export function applyLiveCatalog(c: LiveCatalog) {
  for (const [kind, table] of Object.entries(TABLES)) {
    const srv = c.items?.[kind];
    if (!srv) continue;
    for (const item of table) {
      const base = BUNDLED.items[kind].find((b) => b.id === item.id)!;
      item.price = item.id in srv ? toPrice(srv[item.id]) : base.price;
      item.unlockLevel = c.unlock_levels?.[kind]?.[item.id] ?? base.unlockLevel;
    }
  }
  const daily = (c.daily_rewards ?? [])
    .map((d) => Object.entries(d).find(([k, v]) => (k === "coins" || k === "gems") && typeof v === "number"))
    .filter(Boolean)
    .map((e) => ({ currency: e![0] as Currency, amount: e![1] as number }));
  if (daily.length === BUNDLED.daily.length) DAILY_REWARDS.splice(0, DAILY_REWARDS.length, ...daily);
  liveVersion = c.version;
}

/** Restore the cached published catalogue (call at boot, before the network is tried). */
export async function loadCachedCatalog() {
  const c = (await storage.getItem(KEY, null)) as unknown as LiveCatalog | null;
  if (c?.items) applyLiveCatalog(c);
}

/** Apply + cache a freshly fetched catalogue. */
export async function storeLiveCatalog(c: LiveCatalog) {
  if (!c?.items) return;
  applyLiveCatalog(c);
  await storage.setItem(KEY, c as never);
}

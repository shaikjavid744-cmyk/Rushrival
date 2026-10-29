/**
 * Real-money products — ONE config for the app (server mirror: backend/rr/catalog.py PRODUCTS).
 * Every id is a PLACEHOLDER: configure in Play Console (Monetize → Products → In-app products)
 * with exactly these ids, or change both files. Prices come from Google Play at runtime
 * (localised INR/USD…); `fallbackPrice` is only shown when the store can't be reached.
 */
export type ProductTab = "coins" | "gems" | "offers";
export interface ProductGrant {
  coins?: number;
  gems?: number;
  hoverboards?: number;
  items?: { characters?: string[]; boards?: string[] };
  entitlements?: string[];
}
export interface Product {
  id: string; // configure in Play Console
  title: string;
  subtitle?: string;
  tab: ProductTab;
  consumable: boolean;
  icon: "ellipse" | "diamond" | "gift" | "color-palette" | "ban";
  grant: ProductGrant;
  fallbackPrice: string;
}

export const PRODUCTS: Product[] = [
  { id: "rr_coins_10k", title: "10,000 Coins", tab: "coins", consumable: true, icon: "ellipse", grant: { coins: 10000 }, fallbackPrice: "$0.99" },
  { id: "rr_coins_60k", title: "60,000 Coins", tab: "coins", consumable: true, icon: "ellipse", grant: { coins: 60000 }, fallbackPrice: "$4.99" },
  { id: "rr_gems_100", title: "100 Gems", tab: "gems", consumable: true, icon: "diamond", grant: { gems: 100 }, fallbackPrice: "$0.99" },
  { id: "rr_gems_550", title: "550 Gems", tab: "gems", consumable: true, icon: "diamond", grant: { gems: 550 }, fallbackPrice: "$4.99" },
  { id: "rr_gems_1200", title: "1,200 Gems", tab: "gems", consumable: true, icon: "diamond", grant: { gems: 1200 }, fallbackPrice: "$9.99" },
  { id: "rr_starter_bundle", title: "Starter Bundle", subtitle: "20,000 coins · 100 gems · 5 hoverboards", tab: "offers", consumable: false, icon: "gift", grant: { coins: 20000, gems: 100, hoverboards: 5, entitlements: ["starter_bundle"] }, fallbackPrice: "$1.99" },
  { id: "rr_bundle_neon", title: "Neon Pack", subtitle: "Zoe + Neon board", tab: "offers", consumable: false, icon: "color-palette", grant: { items: { characters: ["zoe"], boards: ["neon"] }, entitlements: ["bundle_neon"] }, fallbackPrice: "$2.99" },
  { id: "rr_bundle_inferno", title: "Inferno Pack", subtitle: "Shadow + Flame board", tab: "offers", consumable: false, icon: "color-palette", grant: { items: { characters: ["shadow"], boards: ["flame"] }, entitlements: ["bundle_inferno"] }, fallbackPrice: "$3.99" },
  { id: "rr_remove_ads", title: "Remove Ads", subtitle: "No interstitial ads. Rewarded ads stay optional.", tab: "offers", consumable: false, icon: "ban", grant: { entitlements: ["remove_ads"] }, fallbackPrice: "$2.99" },
];
export const productById = (id: string) => PRODUCTS.find((p) => p.id === id);
export const AD_UNLOCK_TARGET = 5; // completed rewarded views to unlock Leo / Galaxy (server: catalog.AD_UNLOCK_TARGET)

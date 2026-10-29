// Single source of truth for catalogue / product config (backend will mirror this in Phase 3).
export type Currency = "coins" | "gems";
export type Price = { currency: Currency; amount: number } | { ad: true } | null;

export interface RigLook {
  skin: string;
  hair: string;
  hairStyle: "spiky" | "ponytail" | "hood" | "short" | "mohawk";
  top: string;
  accent: string;
  pants: string;
  shoes: string;
  sleeves: "long" | "short";
  shorts: boolean;
  headband?: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  price: Price; // null = free/default
  unlockLevel?: number;
  image: number;
  rig?: RigLook; // characters only: in-run cut-out rig colours
}

/** Front 3/4 menu hero art per character (cards keep the running back view). */
export const HERO_IMAGES: Record<string, number> = {
  rush: require("../../assets/game/hero_rush.png"),
  zoe: require("../../assets/game/hero_zoe.png"),
  kai: require("../../assets/game/hero_kai.png"),
  shadow: require("../../assets/game/hero_shadow.png"),
  nova: require("../../assets/game/hero_nova.png"),
  leo: require("../../assets/game/hero_leo.png"),
};

export const CHARACTERS: CatalogItem[] = [
  { id: "rush", name: "Rush", price: null, image: require("../../assets/game/rush_run.png"), rig: { skin: "#E9B48A", hair: "#6B3A1E", hairStyle: "spiky", top: "#E3262F", accent: "#FFFFFF", pants: "#2F4A78", shoes: "#D91F2A", sleeves: "long", shorts: false, headband: "#E3262F" } },
  { id: "zoe", name: "Zoe", price: { currency: "coins", amount: 25000 }, image: require("../../assets/game/char_zoe.png"), rig: { skin: "#F1C39E", hair: "#FF5FA8", hairStyle: "ponytail", top: "#19B3A6", accent: "#FFD23F", pants: "#1E2233", shoes: "#FFD23F", sleeves: "long", shorts: false } },
  { id: "kai", name: "Kai", price: { currency: "coins", amount: 50000 }, image: require("../../assets/game/char_kai.png"), rig: { skin: "#C98B5E", hair: "#F5C542", hairStyle: "spiky", top: "#2E7BD6", accent: "#FFFFFF", pants: "#1E2A44", shoes: "#F2F2F2", sleeves: "short", shorts: true } },
  { id: "shadow", name: "Shadow", price: { currency: "gems", amount: 150 }, image: require("../../assets/game/char_shadow.png"), rig: { skin: "#D9A47C", hair: "#1B1D26", hairStyle: "hood", top: "#3A3F4E", accent: "#E3262F", pants: "#1B1D26", shoes: "#3A3E4D", sleeves: "long", shorts: false } },
  { id: "nova", name: "Nova", price: { currency: "gems", amount: 300 }, image: require("../../assets/game/char_nova.png"), rig: { skin: "#F3D2B8", hair: "#E6EEF7", hairStyle: "short", top: "#E8F6FF", accent: "#22D3EE", pants: "#22D3EE", shoes: "#FFFFFF", sleeves: "long", shorts: false } },
  { id: "leo", name: "Leo", price: { ad: true }, image: require("../../assets/game/char_leo.png"), rig: { skin: "#B97A50", hair: "#F5C542", hairStyle: "mohawk", top: "#1FA34A", accent: "#F5C542", pants: "#17803A", shoes: "#E0A82E", sleeves: "short", shorts: true } },
];

export const BOARDS: CatalogItem[] = [
  { id: "default", name: "Default", price: null, image: require("../../assets/game/board_default.png") },
  { id: "flame", name: "Flame", price: { currency: "coins", amount: 10000 }, image: require("../../assets/game/board_flame.png") },
  { id: "neon", name: "Neon", price: { currency: "coins", amount: 20000 }, image: require("../../assets/game/board_neon.png") },
  { id: "dragon", name: "Dragon", price: { currency: "gems", amount: 100 }, image: require("../../assets/game/board_dragon.png") },
  { id: "ice", name: "Ice", price: { currency: "gems", amount: 200 }, image: require("../../assets/game/board_ice.png") },
  { id: "galaxy", name: "Galaxy", price: { ad: true }, image: require("../../assets/game/board_galaxy.png") },
];

export interface WorldPalette {
  asphalt: string;
  stripe: string;
  sidewalk: string;
  plaza: string;
  rail: string;
  sleeper: string;
  sky: string;
}

export interface WorldItem extends CatalogItem {
  palette: WorldPalette;
}

const P = (asphalt: string, sidewalk: string, plaza: string, sky: string, rail = "#9AA4B8", sleeper = "#5B4636", stripe = "#2E354A"): WorldPalette => ({
  asphalt,
  stripe,
  sidewalk,
  plaza,
  rail,
  sleeper,
  sky,
});

export const WORLDS: WorldItem[] = [
  { id: "city", name: "City", price: null, image: require("../../assets/game/city_bg.jpg"), palette: P("#394158", "#A3ACC1", "#C9B79C", "#8ED3F7") },
  { id: "beach", name: "Beach", price: { currency: "coins", amount: 5000 }, unlockLevel: 3, image: require("../../assets/game/world_beach.jpg"), palette: P("#C9A46A", "#EBD9A7", "#F3E2B3", "#7FD3F5", "#8C8C8C", "#7A5A3A", "#B48F58") },
  { id: "snow", name: "Snow", price: { currency: "coins", amount: 15000 }, unlockLevel: 6, image: require("../../assets/game/world_snow.jpg"), palette: P("#8FA3B8", "#E8F1FA", "#F4F8FC", "#CFE6F7", "#5E6B7A", "#6B5444", "#7E91A6") },
  { id: "night", name: "Night City", price: { currency: "gems", amount: 120 }, unlockLevel: 9, image: require("../../assets/game/world_night.jpg"), palette: P("#1C2033", "#3A3F5C", "#2A2E45", "#0B1030", "#C46BFF", "#2B2440", "#151829") },
  { id: "temple", name: "Temple", price: { currency: "gems", amount: 200 }, unlockLevel: 12, image: require("../../assets/game/world_temple.jpg"), palette: P("#7A6A4F", "#9C8C67", "#6F7D45", "#F2C66B", "#8B8B7A", "#4E3B28", "#6B5C43") },
  { id: "lava", name: "Lava", price: { currency: "gems", amount: 300 }, unlockLevel: 15, image: require("../../assets/game/world_lava.jpg"), palette: P("#2B2224", "#4A3A36", "#3A2A26", "#B8452A", "#FF8A3D", "#1E1514", "#231B1C") },
];

export const POWERUP_IMAGES = {
  magnet: require("../../assets/game/pu_magnet.png"),
  shield: require("../../assets/game/pu_shield.png"),
  speed: require("../../assets/game/pu_speed.png"),
  x2: require("../../assets/game/pu_x2.png"),
  hoverboard: require("../../assets/game/board_default.png"),
};

export const WELCOME_GIFT = { coins: 2000, gems: 50, hoverboards: 3 };

export const DAILY_REWARDS: { currency: Currency; amount: number }[] = [
  { currency: "coins", amount: 200 },
  { currency: "coins", amount: 400 },
  { currency: "gems", amount: 5 },
  { currency: "coins", amount: 800 },
  { currency: "coins", amount: 1200 },
  { currency: "gems", amount: 15 },
  { currency: "gems", amount: 40 },
];

/** XP needed to go from level n to n+1. */
export const xpForLevel = (level: number) => 250 + (level - 1) * 150;

// ---- missions & achievements (progress derived from lifetime stats; claim is idempotent via event id) ----
export type StatKey = "totalRuns" | "totalDistance" | "totalCoins" | "powerupsUsed" | "bestScore" | "level";
export interface Goal {
  id: string;
  title: string;
  stat: StatKey;
  target: number;
  reward: { currency: Currency; amount: number };
}

export const MISSIONS: Goal[] = [
  { id: "m-runs-3", title: "Play 3 runs", stat: "totalRuns", target: 3, reward: { currency: "coins", amount: 300 } },
  { id: "m-dist-1k", title: "Run 1,000 m in total", stat: "totalDistance", target: 1000, reward: { currency: "coins", amount: 500 } },
  { id: "m-coins-100", title: "Collect 100 coins", stat: "totalCoins", target: 100, reward: { currency: "coins", amount: 400 } },
  { id: "m-pu-3", title: "Use 3 power-ups", stat: "powerupsUsed", target: 3, reward: { currency: "gems", amount: 5 } },
  { id: "m-score-1k", title: "Score 1,000 in one run", stat: "bestScore", target: 1000, reward: { currency: "gems", amount: 10 } },
];

export const ACHIEVEMENTS: Goal[] = [
  { id: "a-runs-25", title: "Regular Runner — 25 runs", stat: "totalRuns", target: 25, reward: { currency: "gems", amount: 20 } },
  { id: "a-dist-10k", title: "Marathon — 10 km total", stat: "totalDistance", target: 10000, reward: { currency: "gems", amount: 30 } },
  { id: "a-coins-2k", title: "Coin Hoarder — 2,000 coins", stat: "totalCoins", target: 2000, reward: { currency: "coins", amount: 2500 } },
  { id: "a-score-5k", title: "High Flyer — score 5,000", stat: "bestScore", target: 5000, reward: { currency: "gems", amount: 40 } },
  { id: "a-level-5", title: "Rising Rival — reach Lv 5", stat: "level", target: 5, reward: { currency: "gems", amount: 25 } },
];

// ---- shop ----------------------------------------------------------------------
export interface ShopItem {
  id: string;
  title: string;
  icon: "diamond" | "ellipse" | "albums";
  grant: { kind: Currency | "hoverboards"; amount: number };
  cost: { currency: Currency; amount: number } | { realMoney: string }; // realMoney → BillingService (Phase 3)
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: "hb-3", title: "3 Hoverboards", icon: "albums", grant: { kind: "hoverboards", amount: 3 }, cost: { currency: "coins", amount: 1500 } },
  { id: "coins-5k", title: "5,000 Coins", icon: "ellipse", grant: { kind: "coins", amount: 5000 }, cost: { currency: "gems", amount: 50 } },
  { id: "coins-15k", title: "15,000 Coins", icon: "ellipse", grant: { kind: "coins", amount: 15000 }, cost: { currency: "gems", amount: 120 } },
  { id: "gems-100", title: "100 Gems", icon: "diamond", grant: { kind: "gems", amount: 100 }, cost: { realMoney: "$0.99" } },
  { id: "gems-550", title: "550 Gems", icon: "diamond", grant: { kind: "gems", amount: 550 }, cost: { realMoney: "$4.99" } },
];

// ---- inbox ---------------------------------------------------------------------
export interface InboxMessage {
  id: string;
  title: string;
  body: string;
  reward?: { currency: Currency; amount: number };
}

export const INBOX: InboxMessage[] = [
  { id: "welcome", title: "Welcome, Rival!", body: "Thanks for playing Rush Rivals. Here's a little something to get you rolling.", reward: { currency: "gems", amount: 10 } },
  { id: "roofs", title: "New: Train roofs!", body: "Run up the yellow ramps to ride on top of parked trains. Watch for flashing red lights — those trains are moving toward you!" },
  { id: "worlds", title: "Explore new worlds", body: "Level up to unlock Beach, Snow, Night City, Temple and Lava worlds in the Worlds collection." },
];

export const REVIVE_GEMS = [5, 10]; // cost of 1st / 2nd revive in a run

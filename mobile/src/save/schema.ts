export const SAVE_VERSION = 2;

export type Graphics = "low" | "medium" | "high";

export interface SaveSettings {
  sound: boolean;
  music: boolean;
  vibration: boolean;
  accessibilityButtons: boolean;
  graphics: Graphics;
  language: string;
  largeText: boolean;
  notifications: boolean;
  adPersonalisation?: boolean; // consent for personalised ads (ads arrive in Phase 4)
}

export interface SaveStats {
  totalRuns: number;
  totalDistance: number;
  totalCoins: number;
  powerupsUsed: number;
}

export interface LedgerEntry {
  id: string;
  type: "grant" | "spend";
  amount: number;
  currency: "coins" | "gems";
  reason: string;
  timestamp: number;
}

export interface SaveData {
  version: number;
  name: string;
  xp: number;
  bestScore: number;
  coins: number;
  gems: number;
  hoverboards: number;
  stats: SaveStats;
  settings: SaveSettings;
  owned: { characters: string[]; boards: string[]; worlds: string[] };
  equipped: { character: string; board: string; world: string };
  onboarding: { done: boolean; giftClaimed: boolean; childMode: boolean; consent: boolean };
  daily: { streak: number; lastClaimDay: number };
  bests: number[];
  ledger: LedgerEntry[];
  eventIds: string[]; // idempotency: every applied economy event id
}

export const MAX_EVENT_IDS = 5000; // idempotency window (Phase 3 moves this server-side)
export const MAX_LEDGER = 200;

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    name: "Player",
    xp: 0,
    bestScore: 0,
    coins: 0,
    gems: 0,
    hoverboards: 0,
    stats: { totalRuns: 0, totalDistance: 0, totalCoins: 0, powerupsUsed: 0 },
    settings: {
      sound: true,
      music: true,
      vibration: true,
      accessibilityButtons: false,
      graphics: "high",
      language: "en",
      largeText: false,
      notifications: false,
    },
    owned: { characters: ["rush"], boards: ["default"], worlds: ["city"] },
    equipped: { character: "rush", board: "default", world: "city" },
    onboarding: { done: false, giftClaimed: false, childMode: false, consent: false },
    daily: { streak: 0, lastClaimDay: -1 },
    bests: [],
    ledger: [],
    eventIds: [],
  };
}

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e12;
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isObj = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");

/** Strict validation; returns a normalized copy or null if anything is invalid. */
export function validateSave(x: unknown): SaveData | null {
  if (!isObj(x) || x.version !== SAVE_VERSION) return null;
  const { stats: st, settings: se, owned, equipped, onboarding: ob, daily } = x;
  if (![x.bestScore, x.coins, x.gems, x.xp, x.hoverboards].every(isCount)) return null;
  if (typeof x.name !== "string" || x.name.length > 24) return null;
  if (!isObj(st) || ![st.totalRuns, st.totalDistance, st.totalCoins, st.powerupsUsed].every(isCount)) return null;
  if (!isObj(se) || ![se.sound, se.music, se.vibration, se.accessibilityButtons, se.largeText, se.notifications].every(isBool)) return null;
  if (!["low", "medium", "high"].includes(se.graphics) || typeof se.language !== "string") return null;
  if (!isObj(owned) || !isStrArr(owned.characters) || !isStrArr(owned.boards) || !isStrArr(owned.worlds)) return null;
  if (!isObj(equipped) || typeof equipped.character !== "string" || typeof equipped.board !== "string" || typeof equipped.world !== "string") return null;
  if (!isObj(ob) || ![ob.done, ob.giftClaimed, ob.childMode, ob.consent].every(isBool)) return null;
  if (!isObj(daily) || !isCount(daily.streak) || typeof daily.lastClaimDay !== "number") return null;
  if (!Array.isArray(x.bests) || !x.bests.every(isCount) || !Array.isArray(x.ledger) || !isStrArr(x.eventIds)) return null;
  return JSON.parse(JSON.stringify(x)) as SaveData;
}

/** Migration hook: MIGRATIONS[n] upgrades data from version n to n + 1. */
export const MIGRATIONS: Record<number, (d: any) => any> = {
  // v0: hypothetical pre-release { best, coins }
  0: (d) => ({
    version: 1,
    bestScore: Math.max(0, Math.floor(Number(d?.best ?? d?.bestScore ?? 0)) || 0),
    coins: Math.max(0, Math.floor(Number(d?.coins ?? 0)) || 0),
    stats: { totalRuns: 0, totalDistance: 0, totalCoins: 0 },
    settings: { sound: true, vibration: true, accessibilityButtons: false },
    bankedRunIds: [],
  }),
  // v1 (Phase 1) → v2: keep coins, best, stats, settings; existing players get onboarding (with gift).
  1: (d) => {
    const b = defaultSave();
    return {
      ...b,
      bestScore: d.bestScore ?? 0,
      coins: d.coins ?? 0,
      stats: { ...b.stats, ...(d.stats ?? {}) },
      settings: { ...b.settings, ...(d.settings ?? {}) },
      bests: d.bestScore ? [d.bestScore] : [],
      eventIds: (d.bankedRunIds ?? []).map((id: string) => `run:${id}`),
    };
  },
};

export function migrate(data: unknown, fromVersion: number): unknown | null {
  let d = data;
  for (let v = fromVersion; v < SAVE_VERSION; v++) {
    const m = MIGRATIONS[v];
    if (!m) return null;
    d = m(d);
  }
  return d;
}

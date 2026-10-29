export const SAVE_VERSION = 1;

export interface SaveSettings {
  sound: boolean;
  vibration: boolean;
  accessibilityButtons: boolean;
}

export interface SaveStats {
  totalRuns: number;
  totalDistance: number;
  totalCoins: number;
}

export interface SaveData {
  version: number;
  bestScore: number;
  coins: number;
  stats: SaveStats;
  settings: SaveSettings;
  bankedRunIds: string[]; // idempotency guard: runs already credited
}

export const MAX_BANKED_IDS = 30;

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    bestScore: 0,
    coins: 0,
    stats: { totalRuns: 0, totalDistance: 0, totalCoins: 0 },
    settings: { sound: true, vibration: true, accessibilityButtons: false },
    bankedRunIds: [],
  };
}

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e12;
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Strict validation; returns a normalized copy or null if anything is invalid. */
export function validateSave(x: unknown): SaveData | null {
  if (!isObj(x) || x.version !== SAVE_VERSION) return null;
  const { stats, settings, bankedRunIds } = x;
  if (!isCount(x.bestScore) || !isCount(x.coins)) return null;
  if (!isObj(stats) || !isCount(stats.totalRuns) || !isCount(stats.totalDistance) || !isCount(stats.totalCoins)) return null;
  if (!isObj(settings) || !isBool(settings.sound) || !isBool(settings.vibration) || !isBool(settings.accessibilityButtons))
    return null;
  if (!Array.isArray(bankedRunIds) || !bankedRunIds.every((s) => typeof s === "string")) return null;
  return {
    version: SAVE_VERSION,
    bestScore: x.bestScore,
    coins: x.coins,
    stats: { totalRuns: stats.totalRuns, totalDistance: stats.totalDistance, totalCoins: stats.totalCoins },
    settings: {
      sound: settings.sound,
      vibration: settings.vibration,
      accessibilityButtons: settings.accessibilityButtons,
    },
    bankedRunIds: bankedRunIds.slice(-MAX_BANKED_IDS) as string[],
  };
}

/**
 * Migration hook: MIGRATIONS[n] upgrades data from version n to n + 1.
 * v0 = hypothetical pre-release unversioned shape { best, coins }.
 */
export const MIGRATIONS: Record<number, (d: any) => any> = {
  0: (d) => {
    const base = defaultSave();
    return {
      ...base,
      bestScore: Math.max(0, Math.floor(Number(d?.best ?? d?.bestScore ?? 0)) || 0),
      coins: Math.max(0, Math.floor(Number(d?.coins ?? 0)) || 0),
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

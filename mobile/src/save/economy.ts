import { DAILY_REWARDS, xpForLevel } from "@/src/config/catalog";

import { MAX_EVENT_IDS, MAX_LEDGER, SaveData } from "./schema";

export type Currency = "coins" | "gems";

export interface Tx {
  eventId: string;
  currency: Currency;
  amount: number; // + grant, - spend
  reason: string;
  now?: number;
}

export interface TxResult {
  save: SaveData;
  ok: boolean;
  error?: "duplicate" | "insufficient" | "invalid";
}

/** THE economy service: every currency change goes through here (ledger + idempotency + no negatives). */
export function applyTx(save: SaveData, tx: Tx): TxResult {
  if (!tx.eventId || !Number.isInteger(tx.amount) || tx.amount === 0) return { save, ok: false, error: "invalid" };
  if (save.eventIds.includes(tx.eventId)) return { save, ok: false, error: "duplicate" };
  const balance = save[tx.currency] + tx.amount;
  if (balance < 0) return { save, ok: false, error: "insufficient" };
  return {
    ok: true,
    save: {
      ...save,
      [tx.currency]: balance,
      eventIds: [...save.eventIds, tx.eventId].slice(-MAX_EVENT_IDS),
      ledger: [
        ...save.ledger,
        {
          id: tx.eventId,
          type: tx.amount > 0 ? "grant" : "spend",
          amount: Math.abs(tx.amount),
          currency: tx.currency,
          reason: tx.reason,
          timestamp: tx.now ?? Date.now(),
        } as const,
      ].slice(-MAX_LEDGER),
    },
  };
}

/** Marks a non-currency event id as used (e.g. welcome gift items) — same idempotency set. */
export function markEvent(save: SaveData, id: string): SaveData {
  return save.eventIds.includes(id) ? save : { ...save, eventIds: [...save.eventIds, id].slice(-MAX_EVENT_IDS) };
}

export function levelInfo(xp: number) {
  let level = 1;
  let rest = xp;
  while (rest >= xpForLevel(level)) {
    rest -= xpForLevel(level);
    level++;
  }
  return { level, into: rest, need: xpForLevel(level) };
}

export interface RunResult {
  runId: string;
  coins: number;
  score: number;
  distance: number;
  powerupsUsed?: number;
}

export interface BankOutcome {
  save: SaveData;
  banked: boolean;
  newBest: boolean;
  previousBest: number;
  levelUp: number | null;
  xp: number;
}

const safeCount = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** Credits a finished run exactly once (event id = run id) via applyTx. */
export function bankRun(save: SaveData, run: RunResult, now = Date.now()): BankOutcome {
  const previousBest = save.bestScore;
  const id = `run:${run.runId}`;
  const none = { save, banked: false, newBest: false, previousBest, levelUp: null, xp: 0 };
  if (!run.runId || save.eventIds.includes(id)) return none;
  const coins = safeCount(run.coins);
  const score = safeCount(run.score);
  const distance = safeCount(run.distance);
  let next = coins > 0 ? applyTx(save, { eventId: id, currency: "coins", amount: coins, reason: "run", now }).save : markEvent(save, id);
  const xp = Math.floor(distance / 10) + coins;
  const before = levelInfo(save.xp).level;
  next = {
    ...next,
    xp: next.xp + xp,
    bestScore: Math.max(previousBest, score),
    bests: [...next.bests, score].sort((a, b) => b - a).slice(0, 10),
    stats: {
      totalRuns: next.stats.totalRuns + 1,
      totalDistance: next.stats.totalDistance + distance,
      totalCoins: next.stats.totalCoins + coins,
      powerupsUsed: next.stats.powerupsUsed + safeCount(run.powerupsUsed ?? 0),
    },
  };
  const after = levelInfo(next.xp).level;
  return { save: next, banked: true, newBest: score > previousBest, previousBest, levelUp: after > before ? after : null, xp };
}

// ---- daily rewards ------------------------------------------------------------
/** Local calendar day number (device local date). */
export function localDay(now: number): number {
  const d = new Date(now);
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
}

export type DailyStatus = { canClaim: boolean; nextStreak: number; reason?: "claimed" | "clock" };

export function dailyStatus(save: SaveData, now: number): DailyStatus {
  const today = localDay(now);
  const last = save.daily.lastClaimDay;
  if (today === last) return { canClaim: false, nextStreak: save.daily.streak, reason: "claimed" };
  if (today < last) return { canClaim: false, nextStreak: save.daily.streak, reason: "clock" }; // clock rollback guard
  const nextStreak = today === last + 1 ? (save.daily.streak % 7) + 1 : 1; // missed day → Day 1
  return { canClaim: true, nextStreak };
}

export function claimDaily(save: SaveData, now: number): TxResult & { day?: number } {
  const st = dailyStatus(save, now);
  if (!st.canClaim) return { save, ok: false, error: "duplicate" };
  const today = localDay(now);
  const reward = DAILY_REWARDS[st.nextStreak - 1];
  const r = applyTx(save, { eventId: `daily:${today}`, currency: reward.currency, amount: reward.amount, reason: `daily-day-${st.nextStreak}`, now });
  if (!r.ok) return r;
  return { ...r, day: st.nextStreak, save: { ...r.save, daily: { streak: st.nextStreak, lastClaimDay: today } } };
}

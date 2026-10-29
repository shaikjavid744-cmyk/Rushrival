import { ACHIEVEMENTS, Goal, MISSIONS, StatKey } from "@/src/config/catalog";

import { applyTx, levelInfo, TxResult } from "./economy";
import { SaveData } from "./schema";

export function statValue(save: SaveData, stat: StatKey): number {
  if (stat === "bestScore") return save.bestScore;
  if (stat === "level") return levelInfo(save.xp).level;
  return save.stats[stat];
}

export type GoalState = "progress" | "ready" | "claimed";

export function goalStatus(save: SaveData, g: Goal): { progress: number; state: GoalState } {
  const progress = Math.min(g.target, statValue(save, g.stat));
  const state: GoalState = save.eventIds.includes(`goal:${g.id}`) ? "claimed" : progress >= g.target ? "ready" : "progress";
  return { progress, state };
}

/** Claims a completed mission/achievement once (event id goal:<id>). */
export function claimGoal(save: SaveData, id: string, now: number): TxResult {
  const g = [...MISSIONS, ...ACHIEVEMENTS].find((x) => x.id === id);
  if (!g) return { save, ok: false, error: "invalid" };
  const st = goalStatus(save, g);
  if (st.state === "claimed") return { save, ok: false, error: "duplicate" };
  if (st.state !== "ready") return { save, ok: false, error: "invalid" };
  return applyTx(save, { eventId: `goal:${g.id}`, currency: g.reward.currency, amount: g.reward.amount, reason: `goal-${g.id}`, now });
}

export function readyGoalCount(save: SaveData): number {
  return [...MISSIONS, ...ACHIEVEMENTS].filter((g) => goalStatus(save, g).state === "ready").length;
}

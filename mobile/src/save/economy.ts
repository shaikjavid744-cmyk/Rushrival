import { MAX_BANKED_IDS, SaveData } from "./schema";

export interface RunResult {
  runId: string;
  coins: number;
  score: number;
  distance: number;
}

export interface BankOutcome {
  save: SaveData;
  banked: boolean; // false when this runId was already credited
  newBest: boolean;
  previousBest: number;
}

const safeCount = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** Credits a finished run exactly once (runId guard). Pure: returns a new save object. */
export function bankRun(save: SaveData, run: RunResult): BankOutcome {
  const previousBest = save.bestScore;
  if (!run.runId || save.bankedRunIds.includes(run.runId)) {
    return { save, banked: false, newBest: false, previousBest };
  }
  const coins = safeCount(run.coins);
  const score = safeCount(run.score);
  const distance = safeCount(run.distance);
  const newBest = score > previousBest;
  const next: SaveData = {
    ...save,
    coins: save.coins + coins,
    bestScore: Math.max(previousBest, score),
    stats: {
      totalRuns: save.stats.totalRuns + 1,
      totalDistance: save.stats.totalDistance + distance,
      totalCoins: save.stats.totalCoins + coins,
    },
    bankedRunIds: [...save.bankedRunIds, run.runId].slice(-MAX_BANKED_IDS),
  };
  return { save: next, banked: true, newBest, previousBest };
}

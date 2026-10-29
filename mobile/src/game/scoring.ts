import { TUNING } from "./constants";

/** Score = floor(metres travelled) + 10 per coin. */
export function computeScore(distance: number, coins: number): number {
  return Math.floor(Math.max(0, distance)) + TUNING.coinScore * coins;
}

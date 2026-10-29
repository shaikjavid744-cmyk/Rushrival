import { TUNING } from "./constants";
import type { PlayerState } from "./player";
import type { Coin, Obstacle } from "./types";

export function overlapsZ(objZ: number, depth: number, playerZ: number): boolean {
  const h = TUNING.playerHalfDepth;
  return objZ - playerZ < h && objZ + depth - playerZ > -h;
}

export function overlapsLane(playerX: number, lane: number): boolean {
  return Math.abs(playerX - lane) < TUNING.laneHitHalfWidth;
}

/** True when the player collides with the obstacle given its current pose. */
export function hitsObstacle(p: PlayerState, o: Obstacle, playerZ: number): boolean {
  if (!overlapsZ(o.z, o.depth, playerZ) || !overlapsLane(p.x, o.lane)) return false;
  switch (o.kind) {
    case "low":
      return p.y < TUNING.lowClearHeight; // must jump over
    case "high":
      return !p.sliding; // must slide under
    case "train":
      return true; // must change lane
  }
}

export function picksCoin(p: PlayerState, c: Coin, playerZ: number): boolean {
  if (Math.abs(c.z - playerZ) >= TUNING.coinPickRadiusZ) return false;
  if (Math.abs(p.x - c.lane) >= TUNING.coinPickHalfWidth) return false;
  const bodyCenter = p.y + (p.sliding ? 0.4 : 0.9);
  return Math.abs(c.y - bodyCenter) < TUNING.coinPickHeight;
}

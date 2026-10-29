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

/** Height of the walkable surface an obstacle offers at the runner's z (ramp or roof), or -1. */
export function surfaceHeight(o: Obstacle, playerZ: number): number {
  if (o.kind !== "train") return -1;
  if (playerZ >= o.z && playerZ <= o.z + o.depth) return TUNING.trainHeight;
  if (o.ramp && playerZ >= o.z - TUNING.rampLength && playerZ < o.z) {
    return (TUNING.trainHeight * (playerZ - (o.z - TUNING.rampLength))) / TUNING.rampLength;
  }
  return -1;
}

/** True when the player collides with the obstacle given its current pose. */
export function hitsObstacle(p: PlayerState, o: Obstacle, playerZ: number): boolean {
  if (!overlapsZ(o.z, o.depth, playerZ) || !overlapsLane(p.x, o.lane)) return false;
  switch (o.kind) {
    case "low":
      return p.y < TUNING.lowClearHeight; // jump over
    case "high":
      return !p.sliding && p.y < 2.4; // slide under
    case "train":
      return p.y < TUNING.trainHeight - TUNING.stepUpTolerance; // front/side hit; on roof = safe
  }
}

export function picksCoin(p: PlayerState, c: Coin, playerZ: number): boolean {
  if (Math.abs(c.z - playerZ) >= TUNING.coinPickRadiusZ) return false;
  if (Math.abs(p.x - c.x) >= TUNING.coinPickHalfWidth) return false;
  const bodyCenter = p.y + (p.sliding ? 0.4 : 0.9);
  return Math.abs(c.y - bodyCenter) < TUNING.coinPickHeight;
}

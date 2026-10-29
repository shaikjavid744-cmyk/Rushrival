// Gameplay tuning. Units: metres, seconds, lane units (-1 | 0 | 1).
export type Lane = -1 | 0 | 1;
export const LANES: readonly Lane[] = [-1, 0, 1];

export const TUNING = {
  laneWidthM: 2.4,

  startSpeed: 12,
  maxSpeed: 28,
  accel: 0.14, // m/s^2 -> caps after ~114 s

  laneChangeTime: 0.14, // seconds to cross one lane
  actionCooldown: 0.12,
  bufferTtl: 0.4,

  jumpVelocity: 9.5,
  gravity: 26, // air time ~0.73 s, peak ~1.74 m
  fastFallGravity: 90,
  slideTime: 0.75,

  playerHalfDepth: 0.4,
  laneHitHalfWidth: 0.55,
  lowClearHeight: 0.85,

  coinPickRadiusZ: 0.9,
  coinPickHalfWidth: 0.5,
  coinPickHeight: 0.9,
  coinScore: 10,

  spawnAhead: 150,
  despawnBehind: 8,
  firstRowAt: 45,
  minRowTime: 0.95, // guaranteed reaction/transition time between rows
  minRowGap: 14,
  trainLength: 14,
  barrierDepth: 0.5,

  maxStep: 1 / 120,
} as const;

export function clampLane(n: number): Lane {
  return (n < -1 ? -1 : n > 1 ? 1 : n) as Lane;
}

export function speedAt(time: number): number {
  return Math.min(TUNING.maxSpeed, TUNING.startSpeed + TUNING.accel * time);
}

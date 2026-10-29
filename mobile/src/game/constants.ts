// Gameplay tuning. Units: metres, seconds, lane units (-1 | 0 | 1).
export type Lane = -1 | 0 | 1;
export const LANES: readonly Lane[] = [-1, 0, 1];

export const TUNING = {
  laneWidthM: 2.4,

  startSpeed: 8.5,
  maxSpeed: 26,
  accel: 0.11, // m/s^2 -> caps after ~159 s

  laneChangeTime: 0.14, // seconds to cross one lane
  actionCooldown: 0.12,
  bufferTtl: 0.4,

  jumpVelocity: 11.5,
  gravity: 25, // air time ~0.92 s, peak ~2.65 m (can reach train roofs)
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
  minRowTime: 1.05, // guaranteed reaction/transition time between rows
  minRowGap: 14,
  trainLength: 14,
  barrierDepth: 0.5,

  trainHeight: 2.6,
  rampLength: 7,
  stepUpTolerance: 0.5,
  movingTrainSpeed: 7,
  movingActivation: 55,
  easyUntilZ: 140, // ~first 10 s: single barriers only
  shieldInvuln: 1.0,
  powerupChance: 0.16,
  roofAfterSec: 30,
  roofEveryMin: 15,
  roofEveryMax: 25,
  reviveInvuln: 3,
  durations: { magnet: 10, shield: 20, speed: 5, x2: 12, hoverboard: 30 },
  speedBoostFactor: 1.6,
  magnetRange: 22,

  maxStep: 1 / 120,
} as const;

export function clampLane(n: number): Lane {
  return (n < -1 ? -1 : n > 1 ? 1 : n) as Lane;
}

export function speedAt(time: number): number {
  return Math.min(TUNING.maxSpeed, TUNING.startSpeed + TUNING.accel * time);
}

/** Track distance covered after `t` seconds on the base speed curve (closed form of ∫speedAt). */
export function zAtTime(t: number): number {
  const tc = (TUNING.maxSpeed - TUNING.startSpeed) / TUNING.accel;
  if (t <= tc) return TUNING.startSpeed * t + 0.5 * TUNING.accel * t * t;
  return TUNING.startSpeed * tc + 0.5 * TUNING.accel * tc * tc + TUNING.maxSpeed * (t - tc);
}

/** Inverse of zAtTime: seconds needed to reach distance z on the base speed curve. */
export function timeAtZ(z: number): number {
  const tc = (TUNING.maxSpeed - TUNING.startSpeed) / TUNING.accel;
  const zc = zAtTime(tc);
  if (z >= zc) return tc + (z - zc) / TUNING.maxSpeed;
  const a = 0.5 * TUNING.accel;
  const b = TUNING.startSpeed;
  return (-b + Math.sqrt(b * b + 4 * a * Math.max(0, z))) / (2 * a);
}


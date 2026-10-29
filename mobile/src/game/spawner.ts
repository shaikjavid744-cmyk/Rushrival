import { Lane, LANES, timeAtZ, TUNING, zAtTime } from "./constants";
import { createRng, Rng } from "./rng";
import type { Cell, CoinSpec, ObstacleKind, PowerUpKind, Row } from "./types";

export function isPassableCell(c: Cell): boolean {
  return c !== "train";
}

/** Lane i of a row can be passed on foot (empty/jump/slide) or over the roof via a stationary ramp train. */
export function isLanePassable(row: Row, i: number): boolean {
  return isPassableCell(row.cells[i]) || (row.ramps[i] && !row.moving[i]);
}

export function isRowAvoidable(row: Row): boolean {
  return [0, 1, 2].some((i) => isLanePassable(row, i));
}

export function rowLength(cells: Cell[]): number {
  return cells.includes("train") ? TUNING.trainLength : TUNING.barrierDepth;
}

/** Minimum clear track between rows so any lane change (2 lanes) / jump / slide / roof drop is possible. */
export function requiredGap(speed: number): number {
  return Math.max(TUNING.minRowGap, speed * TUNING.minRowTime);
}

/** Extra spacing in front of a moving train: it closes on the runner while approaching. */
export function movingExtraGap(speed: number): number {
  const v = TUNING.movingTrainSpeed;
  return (v * TUNING.movingActivation) / (speed + v) + v * TUNING.minRowTime;
}

export function projectedSpeed(speed: number): number {
  return Math.min(TUNING.maxSpeed, speed + TUNING.accel * (TUNING.spawnAhead / Math.max(1, speed)) + 0.5);
}

export function difficultyFor(distance: number): number {
  return Math.max(0, Math.min(1, distance / 2200));
}

/** Track distance reached after TUNING.roofAfterSec seconds of running (first scheduled roof route). */
export function roofStartZ(): number {
  return zAtTime(TUNING.roofAfterSec);
}

const POWERUPS: PowerUpKind[] = ["magnet", "shield", "speed", "x2", "hoverboard"];

function pickRow(rng: Rng, d: number, z: number, roof = false): Pick {
  const cells: [Cell, Cell, Cell] = [null, null, null];
  const ramps: [boolean, boolean, boolean] = [false, false, false];
  const moving: [boolean, boolean, boolean] = [false, false, false];
  const order = [0, 1, 2].sort(() => rng() - 0.5);

  if (z < TUNING.easyUntilZ) {
    cells[order[0]] = rng() < 0.5 ? "low" : "high";
    return { cells, ramps, moving };
  }
  // Roof-route pattern: three trains, at least one with a ramp (scheduled every ~15–25 s after the first 30 s).
  if (roof) {
    cells[0] = cells[1] = cells[2] = "train";
    ramps[order[0]] = true;
    if (rng() < 0.4) ramps[order[1]] = true;
    return { cells, ramps, moving };
  }
  // Oncoming moving train alone in its row.
  if (d > 0.12 && rng() < 0.18) {
    cells[order[0]] = "train";
    moving[order[0]] = true;
    return { cells, ramps, moving };
  }
  const r = rng();
  const count = r < 0.55 - 0.35 * d ? 1 : r < 0.9 - 0.2 * d ? 2 : 3;
  for (let i = 0; i < count; i++) {
    const k = rng();
    const kind: ObstacleKind = k < 0.42 ? "train" : k < 0.71 ? "low" : "high";
    cells[order[i]] = kind;
    if (kind === "train" && rng() < 0.45) ramps[order[i]] = true;
  }
  // Fairness: never three trains without a ramp.
  if (cells.filter((c) => c === "train").length === 3 && !ramps.some(Boolean)) {
    const i = Math.floor(rng() * 3);
    cells[i] = rng() < 0.5 ? "low" : "high";
  }
  return { cells, ramps, moving };
}

interface Pick {
  cells: [Cell, Cell, Cell];
  ramps: [boolean, boolean, boolean];
  moving: [boolean, boolean, boolean];
}

export interface PickupSpec {
  kind: PowerUpKind;
  lane: Lane;
  z: number;
  y: number;
}

export interface SpawnResult {
  row: Row;
  coins: CoinSpec[];
  pickup: PickupSpec | null;
  /** True for the scheduled roof-route pattern (every 15–25 s after the first 30 s). */
  roofRoute: boolean;
}

export class Spawner {
  private rng: Rng = createRng(1);
  nextZ: number = TUNING.firstRowAt;
  powerups = true;

  constructor(seed = 1) {
    this.reset(seed);
  }

  reset(seed: number, startZ: number = TUNING.firstRowAt) {
    this.rng = createRng(seed);
    this.nextZ = startZ;
    this.nextRoofZ = roofStartZ();
  }

  /** Track position of the next scheduled roof route. */
  nextRoofZ = 0;

  generate(speed: number, distance: number): SpawnResult {
    const d = difficultyFor(distance);
    const ps = projectedSpeed(speed);
    const roof = this.nextZ >= this.nextRoofZ;
    // Schedule in run *time* (when the runner reaches the row), not spawn-time speed.
    if (roof) this.nextRoofZ = zAtTime(timeAtZ(this.nextZ) + TUNING.roofEveryMin + this.rng() * (TUNING.roofEveryMax - TUNING.roofEveryMin));
    const { cells, ramps, moving } = pickRow(this.rng, d, this.nextZ, roof);
    const z = this.nextZ + (moving.some(Boolean) ? movingExtraGap(ps) : 0);
    const row: Row = { z, cells, length: rowLength(cells), ramps, moving };
    const coins = roof || this.rng() < 0.75 ? this.coinsFor(row) : [];
    let pickup: PickupSpec | null = null;
    if (this.powerups && z > TUNING.easyUntilZ && this.rng() < TUNING.powerupChance) {
      const free = LANES.filter((_, i) => isPassableCell(cells[i]));
      if (free.length) {
        const lane = free[Math.floor(this.rng() * free.length)];
        pickup = { kind: POWERUPS[Math.floor(this.rng() * POWERUPS.length)], lane, z: z - 9, y: 1.0 };
      }
    }
    const gap = requiredGap(ps) * (1 + this.rng() * (0.6 - 0.35 * d));
    this.nextZ = row.z + row.length + gap;
    return { row, coins, pickup, roofRoute: roof };
  }

  private coinsFor(row: Row): CoinSpec[] {
    const foot = LANES.filter((_, i) => isPassableCell(row.cells[i]));
    const out: CoinSpec[] = [];
    if (!foot.length) {
      // Roof route: coins up the ramp and along the roof.
      const lane = LANES.find((_, i) => row.ramps[i])!;
      const H = TUNING.trainHeight;
      for (let dz = -TUNING.rampLength + 1; dz <= row.length - 1; dz += 2.2) {
        const y = dz < 0 ? (H * (dz + TUNING.rampLength)) / TUNING.rampLength + 0.6 : H + 0.6;
        out.push({ lane, z: row.z + dz, y });
      }
      return out;
    }
    const lane: Lane = foot[Math.floor(this.rng() * foot.length)];
    const cell = row.cells[lane + 1];
    if (cell === "low") {
      for (let dz = -6; dz <= 6; dz += 2) {
        const t = dz / 6;
        out.push({ lane, z: row.z + dz, y: 0.6 + 1.3 * (1 - t * t) });
      }
    } else if (cell === "high") {
      for (let dz = -12; dz <= -3; dz += 2.25) out.push({ lane, z: row.z + dz, y: 0.6 });
    } else {
      for (let dz = -8; dz <= 8; dz += 2.2) out.push({ lane, z: row.z + dz, y: 0.6 });
    }
    return out;
  }
}

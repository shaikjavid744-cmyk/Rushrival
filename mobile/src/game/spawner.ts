import { Lane, LANES, TUNING } from "./constants";
import { createRng, Rng } from "./rng";
import type { Cell, CoinSpec, ObstacleKind, Row } from "./types";

export function isPassableCell(c: Cell): boolean {
  return c !== "train";
}

/** A row is avoidable when at least one lane can be passed (empty, jump or slide). */
export function isRowAvoidable(row: Row): boolean {
  return row.cells.some(isPassableCell);
}

export function rowLength(cells: Cell[]): number {
  return cells.includes("train") ? TUNING.trainLength : TUNING.barrierDepth;
}

/** Minimum clear track between rows so any lane change (2 lanes) / jump / slide is possible. */
export function requiredGap(speed: number): number {
  return Math.max(TUNING.minRowGap, speed * TUNING.minRowTime);
}

/** Speed the player can have when reaching a row spawned `ahead` metres away (worst case). */
export function projectedSpeed(speed: number): number {
  return Math.min(TUNING.maxSpeed, speed + TUNING.accel * (TUNING.spawnAhead / Math.max(1, speed)) + 0.5);
}

export function difficultyFor(distance: number): number {
  return Math.max(0, Math.min(1, distance / 1800));
}

const KINDS: ObstacleKind[] = ["train", "low", "high"];

function pickCells(rng: Rng, d: number): [Cell, Cell, Cell] {
  const r = rng();
  const count = r < 0.55 - 0.35 * d ? 1 : r < 0.9 - 0.2 * d ? 2 : 3;
  const cells: [Cell, Cell, Cell] = [null, null, null];
  const order = [0, 1, 2].sort(() => rng() - 0.5);
  for (let i = 0; i < count; i++) {
    const k = rng();
    cells[order[i]] = k < 0.4 ? KINDS[0] : k < 0.7 ? KINDS[1] : KINDS[2];
  }
  // Fairness rule: never block every lane with trains.
  if (cells.filter((c) => c === "train").length === 3) {
    cells[Math.floor(rng() * 3)] = rng() < 0.5 ? "low" : "high";
  }
  return cells;
}

export interface SpawnResult {
  row: Row;
  coins: CoinSpec[];
}

export class Spawner {
  private rng: Rng = createRng(1);
  nextZ: number = TUNING.firstRowAt;

  constructor(seed = 1) {
    this.reset(seed);
  }

  reset(seed: number, startZ: number = TUNING.firstRowAt) {
    this.rng = createRng(seed);
    this.nextZ = startZ;
  }

  generate(speed: number, distance: number): SpawnResult {
    const d = difficultyFor(distance);
    const cells = pickCells(this.rng, d);
    const row: Row = { z: this.nextZ, cells, length: rowLength(cells) };
    const coins = this.rng() < 0.75 ? this.coinsFor(row) : [];
    const gap = requiredGap(projectedSpeed(speed)) * (1 + this.rng() * (0.6 - 0.35 * d));
    this.nextZ = row.z + row.length + gap;
    return { row, coins };
  }

  private coinsFor(row: Row): CoinSpec[] {
    const passable = LANES.filter((_, i) => isPassableCell(row.cells[i]));
    const lane: Lane = passable[Math.floor(this.rng() * passable.length)];
    const cell = row.cells[lane + 1];
    const out: CoinSpec[] = [];
    if (cell === "low") {
      // Arc over the low barrier, following the jump.
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

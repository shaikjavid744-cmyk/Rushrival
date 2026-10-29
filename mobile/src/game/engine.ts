import { Lane, speedAt, TUNING } from "./constants";
import { hitsObstacle, picksCoin } from "./collision";
import { Action, createPlayer, PlayerEvent, PlayerState, queueAction, resetPlayer, stepPlayer } from "./player";
import { Pool } from "./pool";
import { randomSeed } from "./rng";
import { computeScore } from "./scoring";
import { Spawner } from "./spawner";
import type { Coin, Obstacle, ObstacleKind, Row } from "./types";

export type GameEvent = PlayerEvent | "coin" | "crash";

export interface EngineOptions {
  autoSpawn?: boolean;
}

let runCounter = 0;
function makeRunId(): string {
  runCounter += 1;
  return `run-${Date.now().toString(36)}-${runCounter}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/** Pure game simulation (no rendering). Pause = simply stop calling update(). */
export class GameEngine {
  readonly player: PlayerState = createPlayer();
  readonly obstacles = new Pool<Obstacle>(48, () => ({ active: false, kind: "low", lane: 0, z: 0, depth: 0 }));
  readonly coins = new Pool<Coin>(160, () => ({ active: false, lane: 0, z: 0, y: 0 }));
  readonly spawner = new Spawner();
  rows: Row[] = [];

  runId = "";
  distance = 0;
  time = 0;
  speed: number = TUNING.startSpeed;
  coinsCollected = 0;
  crashed = false;
  crashKind: ObstacleKind | null = null;
  private events: GameEvent[] = [];
  private autoSpawn: boolean;

  constructor(seed: number = randomSeed(), opts: EngineOptions = {}) {
    this.autoSpawn = opts.autoSpawn ?? true;
    this.reset(seed);
  }

  reset(seed: number = randomSeed()) {
    resetPlayer(this.player);
    this.obstacles.releaseAll();
    this.coins.releaseAll();
    this.rows = [];
    this.spawner.reset(seed);
    this.runId = makeRunId();
    this.distance = 0;
    this.time = 0;
    this.speed = TUNING.startSpeed;
    this.coinsCollected = 0;
    this.crashed = false;
    this.crashKind = null;
    this.events = [];
    if (this.autoSpawn) this.fill();
  }

  get score(): number {
    return computeScore(this.distance, this.coinsCollected);
  }

  input(a: Action) {
    if (this.crashed) return;
    queueAction(this.player, a, this.events as PlayerEvent[]);
  }

  drainEvents(): GameEvent[] {
    if (this.events.length === 0) return EMPTY;
    const e = this.events;
    this.events = [];
    return e;
  }

  update(dt: number) {
    let remaining = Math.min(Math.max(0, dt), 0.1);
    while (remaining > 1e-6 && !this.crashed) {
      const step = Math.min(TUNING.maxStep, remaining);
      this.step(step);
      remaining -= step;
    }
  }

  addObstacle(kind: ObstacleKind, lane: Lane, z: number): Obstacle {
    const o = this.obstacles.acquire();
    o.kind = kind;
    o.lane = lane;
    o.z = z;
    o.depth = kind === "train" ? TUNING.trainLength : TUNING.barrierDepth;
    return o;
  }

  addCoin(lane: Lane, z: number, y = 0.6): Coin {
    const c = this.coins.acquire();
    c.lane = lane;
    c.z = z;
    c.y = y;
    return c;
  }

  private step(dt: number) {
    this.time += dt;
    this.speed = speedAt(this.time);
    this.distance += this.speed * dt;
    stepPlayer(this.player, dt, this.events as PlayerEvent[]);

    const behind = this.distance - TUNING.despawnBehind;
    for (const o of this.obstacles.items) {
      if (!o.active) continue;
      if (o.z + o.depth < behind) {
        this.obstacles.release(o);
      } else if (hitsObstacle(this.player, o, this.distance)) {
        this.crashed = true;
        this.crashKind = o.kind;
        this.events.push("crash");
        return;
      }
    }
    for (const c of this.coins.items) {
      if (!c.active) continue;
      if (c.z < behind) {
        this.coins.release(c);
      } else if (picksCoin(this.player, c, this.distance)) {
        this.coins.release(c);
        this.coinsCollected += 1;
        this.events.push("coin");
      }
    }
    if (this.rows.length && this.rows[0].z + this.rows[0].length < behind) this.rows.shift();
    if (this.autoSpawn) this.fill();
  }

  private fill() {
    while (this.spawner.nextZ < this.distance + TUNING.spawnAhead) {
      const { row, coins } = this.spawner.generate(this.speed, this.distance);
      this.rows.push(row);
      row.cells.forEach((cell, i) => {
        if (cell) this.addObstacle(cell, (i - 1) as Lane, row.z);
      });
      for (const c of coins) this.addCoin(c.lane, c.z, c.y);
    }
  }
}

const EMPTY: GameEvent[] = [];

import { Lane, speedAt, TUNING } from "./constants";
import { hitsObstacle, overlapsLane, picksCoin, surfaceHeight } from "./collision";
import { Action, createPlayer, PlayerEvent, PlayerState, queueAction, resetPlayer, stepPlayer } from "./player";
import { Pool } from "./pool";
import { randomSeed } from "./rng";
import { Spawner } from "./spawner";
import type { Coin, Obstacle, ObstacleKind, Pickup, PowerUpKind, Row } from "./types";

export type GameEvent = PlayerEvent | "coin" | "crash" | "powerup" | "shieldBreak" | "boardBreak";

export interface EngineOptions {
  autoSpawn?: boolean;
  powerups?: boolean;
}

export type Timers = Record<PowerUpKind, number>;

let runCounter = 0;
function makeRunId(): string {
  runCounter += 1;
  return `run-${Date.now().toString(36)}-${runCounter}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

const zeroTimers = (): Timers => ({ magnet: 0, shield: 0, speed: 0, x2: 0, hoverboard: 0 });

/** Pure game simulation (no rendering). Pause = simply stop calling update(). */
export class GameEngine {
  readonly player: PlayerState = createPlayer();
  readonly obstacles = new Pool<Obstacle>(48, () => ({ active: false, kind: "low", lane: 0, z: 0, depth: 0, ramp: false, moving: false, vz: 0, row: null }));
  readonly coins = new Pool<Coin>(160, () => ({ active: false, lane: 0, z: 0, y: 0, x: 0 }));
  readonly pickups = new Pool<Pickup>(8, () => ({ active: false, kind: "magnet", lane: 0, z: 0, y: 1 }));
  readonly spawner = new Spawner();
  rows: Row[] = [];

  runId = "";
  distance = 0;
  time = 0;
  speed: number = TUNING.startSpeed;
  coinsCollected = 0;
  distPoints = 0;
  coinPoints = 0;
  crashed = false;
  crashKind: ObstacleKind | null = null;
  timers: Timers = zeroTimers();
  invuln = 0;
  powerupsUsed = 0;
  shieldsUsed = 0;
  revives = 0;
  /** Tutorial / test hook: when true, crashes are ignored. */
  godMode = false;
  private events: GameEvent[] = [];
  private autoSpawn: boolean;

  constructor(seed: number = randomSeed(), opts: EngineOptions = {}) {
    this.autoSpawn = opts.autoSpawn ?? true;
    this.spawner.powerups = opts.powerups ?? true;
    this.reset(seed);
  }

  reset(seed: number = randomSeed()) {
    resetPlayer(this.player);
    this.obstacles.releaseAll();
    this.coins.releaseAll();
    this.pickups.releaseAll();
    this.rows = [];
    this.spawner.reset(seed);
    this.runId = makeRunId();
    this.distance = 0;
    this.time = 0;
    this.speed = TUNING.startSpeed;
    this.coinsCollected = 0;
    this.distPoints = 0;
    this.coinPoints = 0;
    this.crashed = false;
    this.crashKind = null;
    this.timers = zeroTimers();
    this.invuln = 0;
    this.powerupsUsed = 0;
    this.shieldsUsed = 0;
    this.revives = 0;
    this.events = [];
    if (this.autoSpawn) this.fill();
  }

  /** Score = floor(distance points) + coin points; x2 doubles both while active. */
  get score(): number {
    return Math.floor(this.distPoints) + this.coinPoints;
  }

  get multiplier(): number {
    return this.timers.x2 > 0 ? 2 : 1;
  }

  input(a: Action) {
    if (this.crashed) return;
    queueAction(this.player, a, this.events as PlayerEvent[]);
  }

  activatePowerUp(kind: PowerUpKind) {
    this.timers[kind] = TUNING.durations[kind];
    this.powerupsUsed += 1;
    this.events.push("powerup");
  }

  /** Second chance after a crash: clears nearby obstacles, puts the runner back on the ground, brief invulnerability. */
  revive() {
    if (!this.crashed) return;
    const p = this.player;
    for (const o of this.obstacles.items) if (o.active && o.z < this.distance + 30 && o.z + o.depth > this.distance - 3) o.active = false;
    p.y = 0;
    p.vy = 0;
    p.support = 0;
    p.airborne = false;
    p.fastFall = false;
    p.sliding = false;
    p.slideTimer = 0;
    p.x = p.lane;
    this.crashed = false;
    this.crashKind = null;
    this.invuln = TUNING.reviveInvuln;
    this.revives += 1;
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

  addObstacle(kind: ObstacleKind, lane: Lane, z: number, opts: { ramp?: boolean; moving?: boolean; row?: Row | null } = {}): Obstacle {
    const o = this.obstacles.acquire();
    o.kind = kind;
    o.lane = lane;
    o.z = z;
    o.depth = kind === "train" ? TUNING.trainLength : TUNING.barrierDepth;
    o.ramp = !!opts.ramp;
    o.moving = !!opts.moving;
    o.vz = 0;
    o.row = opts.row ?? null;
    return o;
  }

  addCoin(lane: Lane, z: number, y = 0.6): Coin {
    const c = this.coins.acquire();
    c.lane = lane;
    c.x = lane;
    c.z = z;
    c.y = y;
    return c;
  }

  addPickup(kind: PowerUpKind, lane: Lane, z: number, y = 1): Pickup {
    const p = this.pickups.acquire();
    p.kind = kind;
    p.lane = lane;
    p.z = z;
    p.y = y;
    return p;
  }

  private step(dt: number) {
    const p = this.player;
    this.time += dt;
    for (const k in this.timers) {
      const key = k as PowerUpKind;
      if (this.timers[key] > 0) this.timers[key] = Math.max(0, this.timers[key] - dt);
    }
    this.invuln = Math.max(0, this.invuln - dt);
    const boost = this.timers.speed > 0 ? TUNING.speedBoostFactor : 1;
    this.speed = speedAt(this.time) * boost;
    this.distance += this.speed * dt;
    this.distPoints += this.speed * dt * this.multiplier;

    // Moving trains: start rolling toward the runner once within activation range.
    let support = 0;
    for (const o of this.obstacles.items) {
      if (!o.active) continue;
      if (o.moving && o.z - this.distance < TUNING.movingActivation) {
        o.vz = -TUNING.movingTrainSpeed;
        o.z += o.vz * dt;
        if (o.row) o.row.z = o.z;
      }
      if (o.kind === "train" && overlapsLane(p.x, o.lane)) {
        const h = surfaceHeight(o, this.distance);
        if (h >= 0 && p.y >= h - TUNING.stepUpTolerance) support = Math.max(support, h);
      }
    }
    p.support = support;
    stepPlayer(p, dt, this.events as PlayerEvent[]);

    const behind = this.distance - TUNING.despawnBehind;
    const safe = this.godMode || this.invuln > 0 || this.timers.speed > 0;
    for (const o of this.obstacles.items) {
      if (!o.active) continue;
      if (o.z + o.depth < behind) {
        this.obstacles.release(o);
      } else if (hitsObstacle(p, o, this.distance)) {
        if (safe) {
          if (!this.godMode && o.kind !== "train") this.obstacles.release(o);
          continue;
        }
        if (this.timers.hoverboard > 0 || this.timers.shield > 0) {
          const board = this.timers.hoverboard > 0;
          if (board) this.timers.hoverboard = 0;
          else this.timers.shield = 0;
          if (!board) this.shieldsUsed += 1;
          this.invuln = TUNING.shieldInvuln;
          if (o.kind !== "train") this.obstacles.release(o);
          this.events.push(board ? "boardBreak" : "shieldBreak");
          continue;
        }
        this.crashed = true;
        this.crashKind = o.kind;
        this.events.push("crash");
        return;
      }
    }
    const magnet = this.timers.magnet > 0;
    for (const c of this.coins.items) {
      if (!c.active) continue;
      if (c.z < behind) {
        this.coins.release(c);
        continue;
      }
      if (magnet && c.z - this.distance < TUNING.magnetRange) {
        // Pull toward the runner in all lanes.
        const k = Math.min(1, dt * 8);
        c.x += (p.x - c.x) * k;
        c.y += (p.y + 0.9 - c.y) * k;
        c.z += (this.distance - c.z) * Math.min(1, dt * 4);
      }
      if (picksCoin(p, c, this.distance)) {
        this.coins.release(c);
        this.coinsCollected += 1;
        this.coinPoints += 10 * this.multiplier;
        this.events.push("coin");
      }
    }
    for (const u of this.pickups.items) {
      if (!u.active) continue;
      if (u.z < behind) this.pickups.release(u);
      else if (Math.abs(u.z - this.distance) < 1 && Math.abs(p.x - u.lane) < 0.5 && Math.abs(p.y + 0.9 - u.y) < 1.4) {
        this.pickups.release(u);
        this.activatePowerUp(u.kind);
      }
    }
    if (this.rows.length && this.rows[0].z + this.rows[0].length < behind) this.rows.shift();
    if (this.autoSpawn) this.fill();
  }

  private fill() {
    while (this.spawner.nextZ < this.distance + TUNING.spawnAhead) {
      const { row, coins, pickup } = this.spawner.generate(this.speed, this.distance);
      this.rows.push(row);
      row.cells.forEach((cell, i) => {
        if (cell) this.addObstacle(cell, (i - 1) as Lane, row.z, { ramp: row.ramps[i], moving: row.moving[i], row: row.moving[i] ? row : null });
      });
      for (const c of coins) this.addCoin(c.lane, c.z, c.y);
      if (pickup) this.addPickup(pickup.kind, pickup.lane, pickup.z, pickup.y);
    }
  }
}

const EMPTY: GameEvent[] = [];

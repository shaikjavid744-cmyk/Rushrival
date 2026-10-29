/// <reference types="jest" />
import { hitsObstacle, picksCoin } from "../collision";
import { TUNING } from "../constants";
import { GameEngine } from "../engine";
import { createPlayer } from "../player";
import { computeScore } from "../scoring";
import type { Obstacle } from "../types";

const obs = (kind: Obstacle["kind"], lane: -1 | 0 | 1, z = 0): Obstacle => ({
  active: true,
  kind,
  lane,
  z,
  depth: kind === "train" ? TUNING.trainLength : TUNING.barrierDepth,
});

describe("collision", () => {
  it("low barrier: hit on ground, cleared when jumping high enough", () => {
    const p = createPlayer();
    expect(hitsObstacle(p, obs("low", 0), 0)).toBe(true);
    p.y = 1.2;
    p.airborne = true;
    expect(hitsObstacle(p, obs("low", 0), 0)).toBe(false);
  });

  it("high barrier: hit standing or jumping, cleared by sliding", () => {
    const p = createPlayer();
    expect(hitsObstacle(p, obs("high", 0), 0)).toBe(true);
    p.y = 1.5;
    expect(hitsObstacle(p, obs("high", 0), 0)).toBe(true);
    p.y = 0;
    p.sliding = true;
    expect(hitsObstacle(p, obs("high", 0), 0)).toBe(false);
  });

  it("train: always hits in same lane, never in other lane", () => {
    const p = createPlayer();
    p.y = 1.7;
    expect(hitsObstacle(p, obs("train", 0, -5), 0)).toBe(true);
    p.x = 1;
    p.lane = 1;
    expect(hitsObstacle(p, obs("train", 0, -5), 0)).toBe(false);
  });

  it("no hit when obstacle is ahead or behind", () => {
    const p = createPlayer();
    expect(hitsObstacle(p, obs("low", 0, 3), 0)).toBe(false);
    expect(hitsObstacle(p, obs("low", 0, -3), 0)).toBe(false);
  });

  it("coins: picked in lane, not in other lane, not when far above", () => {
    const p = createPlayer();
    expect(picksCoin(p, { active: true, lane: 0, z: 0.3, y: 0.6 }, 0)).toBe(true);
    expect(picksCoin(p, { active: true, lane: 1, z: 0.3, y: 0.6 }, 0)).toBe(false);
    expect(picksCoin(p, { active: true, lane: 0, z: 0.3, y: 2.0 }, 0)).toBe(false);
  });
});

describe("score", () => {
  it("score = floor(metres) + 10 per coin", () => {
    expect(computeScore(0, 0)).toBe(0);
    expect(computeScore(123.99, 0)).toBe(123);
    expect(computeScore(123.99, 4)).toBe(163);
  });
});

describe("engine coin collection", () => {
  it("JRN-5: each touched coin disappears and adds 1 coin and +10 score", () => {
    const e = new GameEngine(1, { autoSpawn: false });
    const coins = [5, 7, 9].map((z) => e.addCoin(0, z));
    e.addCoin(1, 6); // other lane: not collected
    for (let i = 0; i < 120; i++) e.update(1 / 60);
    expect(e.coinsCollected).toBe(3);
    coins.forEach((c) => expect(c.active).toBe(false));
    expect(e.coins.activeCount).toBe(0); // other-lane coin despawned behind
    expect(e.score).toBe(Math.floor(e.distance) + 30);
    const events = e.drainEvents();
    expect(events.filter((x) => x === "coin").length).toBe(3);
  });

  it("JRN-6: crash stops the run and score accumulation", () => {
    const e = new GameEngine(1, { autoSpawn: false });
    e.addObstacle("train", 0, 10);
    for (let i = 0; i < 120; i++) e.update(1 / 60);
    expect(e.crashed).toBe(true);
    const frozen = e.score;
    e.update(1);
    expect(e.score).toBe(frozen);
    expect(e.drainEvents()).toContain("crash");
  });

  it("speed ramps then caps at max", () => {
    const e = new GameEngine(3, { autoSpawn: false });
    const s0 = e.speed;
    e.update(0.1);
    for (let i = 0; i < 60 * 30; i++) e.update(1 / 60);
    expect(e.speed).toBeGreaterThan(s0);
    for (let i = 0; i < 60 * 120; i++) e.update(1 / 60);
    expect(e.speed).toBe(TUNING.maxSpeed);
  });

  it("uses object pools (no unbounded growth over a long run)", () => {
    const e = new GameEngine(5);
    e.player.y = 0;
    // keep the player alive by forcing autopilot-free invincibility: just simulate world churn
    const before = e.obstacles.items.length;
    for (let i = 0; i < 60 * 60; i++) {
      e.crashed = false;
      e.update(1 / 60);
    }
    expect(e.obstacles.items.length).toBeLessThanOrEqual(Math.max(before, 64));
    expect(e.coins.items.length).toBeLessThanOrEqual(240);
  });
});

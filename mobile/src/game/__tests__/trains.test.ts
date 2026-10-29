/// <reference types="jest" />
import { TUNING } from "../constants";
import { GameEngine } from "../engine";

const run = (e: GameEngine, s: number) => {
  for (let i = 0; i < Math.round(s * 120); i++) e.update(1 / 120);
};

describe("train roofs, ramps and moving trains", () => {
  it("ramp carries the runner onto the roof, then drops back to ground", () => {
    const e = new GameEngine(1, { autoSpawn: false });
    e.addObstacle("train", 0, 20, { ramp: true });
    let maxY = 0;
    for (let i = 0; i < 120 * 6; i++) {
      e.update(1 / 120);
      maxY = Math.max(maxY, e.player.y);
    }
    expect(e.crashed).toBe(false);
    expect(maxY).toBeCloseTo(TUNING.trainHeight, 1);
    expect(e.player.y).toBe(0);
  });

  it("hitting the train front without ramp = crash", () => {
    const e = new GameEngine(1, { autoSpawn: false });
    e.addObstacle("train", 0, 12);
    run(e, 3);
    expect(e.crashed).toBe(true);
  });

  it("a well-timed jump lands on the roof without a ramp", () => {
    const e = new GameEngine(1, { autoSpawn: false });
    e.addObstacle("train", 0, 10);
    // jump so the runner is near apex when reaching the front (~0.4 s before contact)
    while (10 - e.distance > e.speed * 0.4) e.update(1 / 120);
    e.input("up");
    run(e, 1.2);
    expect(e.crashed).toBe(false);
    expect(e.player.y).toBeCloseTo(TUNING.trainHeight, 1);
  });

  it("swipe down mid-air fast-drops", () => {
    const e = new GameEngine(1, { autoSpawn: false });
    e.input("up");
    run(e, 0.2);
    e.update(0.2); // cooldown
    e.input("down");
    run(e, 0.35);
    expect(e.player.airborne).toBe(false);
    expect(e.player.sliding).toBe(true);
  });

  it("oncoming train moves toward the runner once in range", () => {
    const e = new GameEngine(1, { autoSpawn: false });
    const o = e.addObstacle("train", 1, 80, { moving: true });
    run(e, 3);
    expect(o.z).toBeLessThan(80);
  });

  it("starts slower (<= 9 m/s) and caps later", () => {
    expect(TUNING.startSpeed).toBeLessThanOrEqual(9);
    const e = new GameEngine(1, { autoSpawn: true, powerups: false });
    const easy = e.rows.filter((r) => r.z < TUNING.easyUntilZ);
    for (const r of easy) expect(r.cells.filter(Boolean).length).toBe(1);
    for (const r of easy) expect(r.cells.includes("train")).toBe(false);
  });
});

describe("power-ups", () => {
  it.each(["magnet", "shield", "speed", "x2", "hoverboard"] as const)("%s lasts its configured duration then expires", (k) => {
    const e = new GameEngine(1, { autoSpawn: false });
    e.activatePowerUp(k);
    run(e, TUNING.durations[k] - 0.1);
    expect(e.timers[k]).toBeGreaterThan(0);
    run(e, 0.2);
    expect(e.timers[k]).toBe(0);
  });

  it("shield absorbs one crash, hoverboard absorbs one crash", () => {
    for (const k of ["shield", "hoverboard"] as const) {
      const e = new GameEngine(1, { autoSpawn: false });
      e.activatePowerUp(k);
      e.addObstacle("low", 0, 5);
      e.addObstacle("low", 0, 30);
      run(e, 4);
      expect(e.crashed).toBe(true); // second barrier ends the run
      expect(e.distance).toBeGreaterThan(29);
    }
  });

  it("speed boost is invulnerable and faster", () => {
    const e = new GameEngine(1, { autoSpawn: false });
    e.activatePowerUp("speed");
    e.addObstacle("train", 0, 10);
    run(e, 2);
    expect(e.crashed).toBe(false);
    expect(e.speed).toBeGreaterThan(TUNING.startSpeed * 1.5);
  });

  it("x2 doubles score gain; magnet pulls coins from other lanes", () => {
    const a = new GameEngine(1, { autoSpawn: false });
    const b = new GameEngine(1, { autoSpawn: false });
    b.activatePowerUp("x2");
    run(a, 3);
    run(b, 3);
    expect(b.score).toBeGreaterThanOrEqual(2 * a.score - 1);
    const m = new GameEngine(1, { autoSpawn: false });
    m.activatePowerUp("magnet");
    m.addCoin(-1, 12);
    m.addCoin(1, 14);
    run(m, 2);
    expect(m.coinsCollected).toBe(2);
  });
});

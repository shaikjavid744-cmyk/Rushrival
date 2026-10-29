/// <reference types="jest" />
import { ACHIEVEMENTS, MISSIONS } from "@/src/config/catalog";

import { TUNING } from "../../game/constants";
import { GameEngine } from "../../game/engine";
import { claimGoal, goalStatus, readyGoalCount } from "../missions";
import { defaultSave } from "../schema";

describe("missions & achievements", () => {
  const runs3 = MISSIONS.find((m) => m.id === "m-runs-3")!;

  it("cannot claim before completion", () => {
    const s = defaultSave();
    expect(goalStatus(s, runs3).state).toBe("progress");
    expect(claimGoal(s, runs3.id, 0).ok).toBe(false);
  });

  it("claims exactly once (idempotent)", () => {
    let s = { ...defaultSave(), stats: { ...defaultSave().stats, totalRuns: 3 } };
    expect(goalStatus(s, runs3).state).toBe("ready");
    const r1 = claimGoal(s, runs3.id, 0);
    expect(r1.ok).toBe(true);
    s = r1.save;
    expect(s.coins).toBe(runs3.reward.amount);
    for (let i = 0; i < 5; i++) {
      const r = claimGoal(s, runs3.id, 0);
      expect(r.ok).toBe(false);
      expect(r.error).toBe("duplicate");
      s = r.save;
    }
    expect(s.coins).toBe(runs3.reward.amount);
    expect(goalStatus(s, runs3).state).toBe("claimed");
  });

  it("level-based achievement uses XP level", () => {
    const lv5 = ACHIEVEMENTS.find((a) => a.id === "a-level-5")!;
    const s = { ...defaultSave(), xp: 100000 };
    expect(goalStatus(s, lv5).state).toBe("ready");
    expect(readyGoalCount(s)).toBeGreaterThanOrEqual(1);
  });

  it("unknown id is rejected", () => {
    expect(claimGoal(defaultSave(), "nope", 0).error).toBe("invalid");
  });
});

describe("power-up durations", () => {
  const kinds = ["magnet", "shield", "speed", "x2", "hoverboard"] as const;
  it.each(kinds)("%s lasts exactly its configured duration", (k) => {
    const e = new GameEngine(1, { autoSpawn: false });
    e.activatePowerUp(k);
    const d = TUNING.durations[k];
    const steps = Math.round(d / 0.05) - 1;
    for (let i = 0; i < steps; i++) e.update(0.05);
    expect(e.timers[k]).toBeGreaterThan(0);
    e.update(0.1);
    expect(e.timers[k]).toBe(0);
  });

  it("x2 doubles score gain while active", () => {
    const a = new GameEngine(1, { autoSpawn: false });
    const b = new GameEngine(1, { autoSpawn: false });
    b.activatePowerUp("x2");
    for (let i = 0; i < 40; i++) {
      a.update(0.05);
      b.update(0.05);
    }
    expect(b.score).toBeGreaterThanOrEqual(a.score * 2 - 1);
  });

  it("shield absorbs one crash", () => {
    const e = new GameEngine(1, { autoSpawn: false });
    e.activatePowerUp("shield");
    e.addObstacle("high", 0, e.distance + 3);
    for (let i = 0; i < 20; i++) e.update(0.05);
    expect(e.crashed).toBe(false);
    expect(e.timers.shield).toBe(0);
  });
});

describe("revive", () => {
  it("clears nearby obstacles, uncrashes and grants invulnerability", () => {
    const e = new GameEngine(1, { autoSpawn: false });
    e.addObstacle("high", 0, e.distance + 3);
    for (let i = 0; i < 20 && !e.crashed; i++) e.update(0.05);
    expect(e.crashed).toBe(true);
    e.revive();
    expect(e.crashed).toBe(false);
    expect(e.revives).toBe(1);
    expect(e.invuln).toBeGreaterThan(0);
    for (let i = 0; i < 20; i++) e.update(0.05);
    expect(e.crashed).toBe(false);
  });
});

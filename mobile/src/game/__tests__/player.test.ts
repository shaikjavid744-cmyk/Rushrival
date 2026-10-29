/// <reference types="jest" />
import { TUNING } from "../constants";
import { createPlayer, PlayerEvent, queueAction, stepPlayer } from "../player";

const step = (p: ReturnType<typeof createPlayer>, seconds: number, ev: PlayerEvent[] = []) => {
  const n = Math.round(seconds / (1 / 120));
  for (let i = 0; i < n; i++) stepPlayer(p, 1 / 120, ev);
  return ev;
};

describe("lanes", () => {
  it("starts in the middle lane", () => {
    expect(createPlayer().lane).toBe(0);
  });

  it("JRN-3: left, left (clamped), right, right", () => {
    const p = createPlayer();
    const ev: PlayerEvent[] = [];
    queueAction(p, "left", ev);
    step(p, 0.3);
    expect(p.lane).toBe(-1);
    queueAction(p, "left", ev);
    step(p, 0.3);
    expect(p.lane).toBe(-1); // edge clamp
    queueAction(p, "right", ev);
    step(p, 0.3);
    expect(p.lane).toBe(0);
    queueAction(p, "right", ev);
    step(p, 0.3);
    expect(p.lane).toBe(1);
    queueAction(p, "right", ev);
    step(p, 0.3);
    expect(p.lane).toBe(1);
    expect(p.x).toBeCloseTo(1, 5);
    expect(ev.filter((e) => e === "lane").length).toBe(3);
  });

  it("never leaves [-1, 1] under random spam", () => {
    const p = createPlayer();
    for (let i = 0; i < 5000; i++) {
      queueAction(p, Math.random() < 0.5 ? "left" : "right", []);
      stepPlayer(p, 1 / 60, []);
      expect(p.lane).toBeGreaterThanOrEqual(-1);
      expect(p.lane).toBeLessThanOrEqual(1);
      expect(p.x).toBeGreaterThanOrEqual(-1);
      expect(p.x).toBeLessThanOrEqual(1);
    }
  });

  it("buffers at most one action during cooldown", () => {
    const p = createPlayer();
    expect(queueAction(p, "left", [])).toBe("applied");
    expect(queueAction(p, "right", [])).toBe("buffered");
    expect(queueAction(p, "right", [])).toBe("dropped");
    step(p, TUNING.actionCooldown + 0.02);
    expect(p.lane).toBe(0); // buffered "right" executed once
    expect(p.buffered).toBeNull();
  });

  it("expires stale buffered actions", () => {
    const p = createPlayer();
    queueAction(p, "up", []);
    queueAction(p, "up", []); // buffered while airborne
    step(p, TUNING.bufferTtl + 0.05);
    expect(p.buffered).toBeNull();
  });
});

describe("jump / slide states", () => {
  it("jump: airborne, rises above barrier height, lands", () => {
    const p = createPlayer();
    const ev = [] as PlayerEvent[];
    queueAction(p, "up", ev);
    expect(p.airborne).toBe(true);
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      stepPlayer(p, 1 / 120, ev);
      peak = Math.max(peak, p.y);
    }
    expect(peak).toBeGreaterThan(TUNING.lowClearHeight);
    expect(p.airborne).toBe(false);
    expect(p.y).toBe(0);
    expect(ev).toContain("jump");
  });

  it("slide: active then stands back up", () => {
    const p = createPlayer();
    queueAction(p, "down", []);
    expect(p.sliding).toBe(true);
    step(p, TUNING.slideTime + 0.05);
    expect(p.sliding).toBe(false);
  });

  it("down while airborne fast-falls then slides on landing", () => {
    const p = createPlayer();
    queueAction(p, "up", []);
    step(p, 0.15);
    queueAction(p, "down", []);
    const ev = step(p, 0.3);
    expect(p.airborne).toBe(false);
    expect(p.sliding).toBe(true);
    expect(ev).toContain("slide");
  });

  it("up while sliding cancels slide into jump", () => {
    const p = createPlayer();
    queueAction(p, "down", []);
    step(p, 0.2);
    queueAction(p, "up", []);
    expect(p.sliding).toBe(false);
    expect(p.airborne).toBe(true);
  });
});

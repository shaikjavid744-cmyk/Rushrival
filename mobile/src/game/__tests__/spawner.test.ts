/// <reference types="jest" />
import { speedAt, TUNING } from "../constants";
import { GameEngine } from "../engine";
import { isPassableCell, isRowAvoidable, projectedSpeed, requiredGap, Spawner } from "../spawner";
import type { Row } from "../types";

describe("spawner fairness (Q-3)", () => {
  it("10,000 rows: 0 unavoidable rows, gaps always sufficient", () => {
    const sp = new Spawner(12345);
    let unavoidable = 0;
    let shortGaps = 0;
    let prev: Row | null = null;
    const kinds = new Set<string>();
    let t = 0;
    for (let i = 0; i < 10000; i++) {
      const speed = speedAt(t);
      const distance = i * 30;
      const { row, coins } = sp.generate(speed, distance);
      row.cells.forEach((c) => c && kinds.add(c));
      if (!isRowAvoidable(row)) unavoidable++;
      if (prev) {
        const gap = row.z - (prev.z + prev.length);
        if (gap < requiredGap(projectedSpeed(speedAt(t - 1)))) shortGaps++;
      }
      // coins only in lanes passable for this row
      for (const c of coins) expect(isPassableCell(row.cells[c.lane + 1])).toBe(true);
      prev = row;
      t += 1;
    }
    expect(unavoidable).toBe(0);
    expect(shortGaps).toBe(0);
    expect([...kinds].sort()).toEqual(["high", "low", "train"]);
  });

  it("is deterministic per seed", () => {
    const a = new Spawner(7);
    const b = new Spawner(7);
    for (let i = 0; i < 50; i++) expect(a.generate(15, i * 20)).toEqual(b.generate(15, i * 20));
  });
});

/** Simple autopilot that only uses legal inputs: proves every generated pattern is physically passable. */
function autopilot(e: GameEngine) {
  const p = e.player;
  const next = e.rows.find((r) => r.z + r.length > e.distance - TUNING.playerHalfDepth);
  if (!next) return;
  const score = (i: number) => (next.cells[i] === null ? 0 : next.cells[i] === "train" ? 99 : 1);
  let best = 0;
  for (let i = 0; i < 3; i++) {
    const cand = score(i) * 10 + Math.abs(i - 1 - p.lane);
    const cur = score(best) * 10 + Math.abs(best - 1 - p.lane);
    if (cand < cur) best = i;
  }
  const target = best - 1;
  if (p.lane !== target) {
    if (p.cooldown <= 0 && p.buffered === null) e.input(target < p.lane ? "left" : "right");
    return;
  }
  const dz = next.z - e.distance;
  const cell = next.cells[best];
  if (cell === "low" && dz > 0 && dz < e.speed * 0.2 && !p.airborne) e.input("up");
  if (cell === "high" && dz > 0 && dz < e.speed * 0.3 && !p.sliding && !p.slideOnLand) e.input("down");
}

describe("full simulation with autopilot (JRN-15)", () => {
  it.each([1, 2, 3, 42, 999])("seed %i survives 4 minutes, reaching capped speed", (seed) => {
    const e = new GameEngine(seed);
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 240 && !e.crashed; i++) {
      autopilot(e);
      e.update(dt);
      e.drainEvents();
    }
    expect(e.crashed).toBe(false);
    expect(e.speed).toBe(TUNING.maxSpeed);
    expect(e.coinsCollected).toBeGreaterThan(0);
  });
});

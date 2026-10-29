/// <reference types="jest" />
import { applyTx, bankRun, claimDaily, dailyStatus, levelInfo } from "../economy";
import { checksum } from "../checksum";
import { decodeSave, KVStore, loadSave, SAVE_KEYS } from "../saveManager";
import { defaultSave, SaveData } from "../schema";

describe("economy property test (Q-9)", () => {
  it("1,000 random ops: never negative, duplicates never re-applied, ledger reconciles", () => {
    let s: SaveData = defaultSave();
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const used: string[] = [];
    let expected = { coins: 0, gems: 0 };
    for (let i = 0; i < 1000; i++) {
      const currency = rnd() < 0.5 ? "coins" : "gems";
      const amount = Math.floor((rnd() - 0.45) * 500) || 1;
      const dup = used.length > 0 && rnd() < 0.2;
      const eventId = dup ? used[Math.floor(rnd() * used.length)] : `e${i}`;
      const r = applyTx(s, { eventId, currency, amount, reason: "prop" });
      if (dup) expect(r.ok).toBe(false);
      if (r.ok) {
        used.push(eventId);
        expected = { ...expected, [currency]: expected[currency] + amount };
      }
      s = r.save;
      expect(s.coins).toBeGreaterThanOrEqual(0);
      expect(s.gems).toBeGreaterThanOrEqual(0);
    }
    expect(s.coins).toBe(expected.coins);
    expect(s.gems).toBe(expected.gems);
    expect(new Set(s.eventIds).size).toBe(s.eventIds.length);
  });

  it("rejects spends that would go negative", () => {
    const r = applyTx(defaultSave(), { eventId: "buy-zoe", currency: "coins", amount: -25000, reason: "buy" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("insufficient");
  });

  it("run banking awards XP and levels up", () => {
    const o = bankRun(defaultSave(), { runId: "a", coins: 100, score: 3000, distance: 2000 });
    expect(o.xp).toBe(300);
    expect(o.levelUp).toBe(2);
    expect(levelInfo(o.save.xp).level).toBe(2);
    expect(bankRun(o.save, { runId: "a", coins: 100, score: 3000, distance: 2000 }).banked).toBe(false);
  });
});

describe("daily rewards date boundary (Q-10, mocked clock)", () => {
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0).getTime();
  const cases: [string, () => void][] = [];
  const claimSeq = (times: number[]) => {
    let s = defaultSave();
    const out: boolean[] = [];
    for (const t of times) {
      const r = claimDaily(s, t);
      out.push(r.ok);
      s = r.save;
    }
    return { s, out };
  };
  cases.push(["first claim works", () => expect(claimSeq([at(2026, 1, 1)]).out).toEqual([true])]);
  cases.push(["same day twice → second rejected", () => expect(claimSeq([at(2026, 1, 1, 8), at(2026, 1, 1, 22)]).out).toEqual([true, false])]);
  cases.push(["23:59 then 00:01 next day → both ok", () => expect(claimSeq([at(2026, 1, 1, 23) + 59 * 60000, at(2026, 1, 2, 0) + 60000]).out).toEqual([true, true])]);
  cases.push(["consecutive days build streak", () => expect(claimSeq([1, 2, 3, 4].map((d) => at(2026, 3, d))).s.daily.streak).toBe(4)]);
  cases.push(["missed day resets to Day 1", () => expect(claimSeq([at(2026, 3, 1), at(2026, 3, 2), at(2026, 3, 4)]).s.daily.streak).toBe(1)]);
  cases.push(["day 7 wraps to day 1", () => expect(claimSeq([1, 2, 3, 4, 5, 6, 7, 8].map((d) => at(2026, 5, d))).s.daily.streak).toBe(1)]);
  cases.push(["clock rollback → no claim", () => expect(claimSeq([at(2026, 6, 10), at(2026, 6, 8)]).out).toEqual([true, false])]);
  cases.push(["rollback then return to same day → still claimed", () => expect(claimSeq([at(2026, 6, 10), at(2026, 6, 9), at(2026, 6, 10, 20)]).out).toEqual([true, false, false])]);
  cases.push(["rollback then future day → allowed", () => expect(claimSeq([at(2026, 6, 10), at(2026, 6, 9), at(2026, 6, 11)]).out).toEqual([true, false, true])]);
  cases.push(["status reason claimed", () => expect(dailyStatus(claimSeq([at(2026, 7, 1)]).s, at(2026, 7, 1, 18)).reason).toBe("claimed")]);
  cases.push(["status reason clock", () => expect(dailyStatus(claimSeq([at(2026, 7, 5)]).s, at(2026, 7, 1)).reason).toBe("clock")]);
  cases.push(["month boundary", () => expect(claimSeq([at(2026, 1, 31), at(2026, 2, 1)]).s.daily.streak).toBe(2)]);
  cases.push(["year boundary", () => expect(claimSeq([at(2026, 12, 31), at(2027, 1, 1)]).s.daily.streak).toBe(2)]);
  cases.push(["leap day", () => expect(claimSeq([at(2028, 2, 28), at(2028, 2, 29), at(2028, 3, 1)]).s.daily.streak).toBe(3)]);
  cases.push(["day-1 reward is 200 coins", () => expect(claimSeq([at(2026, 8, 1)]).s.coins).toBe(200)]);
  cases.push(["day-3 reward is gems", () => expect(claimSeq([1, 2, 3].map((d) => at(2026, 8, d))).s.gems).toBe(5)]);
  cases.push(["ledger has one entry per claim", () => expect(claimSeq([1, 1, 2].map((d) => at(2026, 9, d))).s.ledger.length).toBe(2)]);
  cases.push(["long absence resets", () => expect(claimSeq([at(2026, 1, 1), at(2026, 4, 1)]).s.daily.streak).toBe(1)]);
  cases.push(["early morning after late night counts as new day", () => expect(claimSeq([at(2026, 10, 1, 23), at(2026, 10, 2, 1)]).out).toEqual([true, true])]);
  cases.push(["many attempts same day grant once", () => expect(claimSeq(Array.from({ length: 10 }, (_, i) => at(2026, 11, 1, i + 1))).s.coins).toBe(200)]);
  it.each(cases)("%s", (_n, fn) => fn());
  it("has 20 cases", () => expect(cases.length).toBe(20));
});

describe("v1 → v2 migration (Q-11)", () => {
  const mem = (init: Record<string, string>): KVStore => {
    const m = new Map(Object.entries(init));
    return { get: async (k) => m.get(k) ?? null, set: async (k, v) => (m.set(k, v), true), remove: async (k) => m.delete(k) };
  };
  it("Phase-1 save keeps coins, best, stats, settings", async () => {
    const v1 = {
      version: 1,
      bestScore: 911,
      coins: 56,
      stats: { totalRuns: 3, totalDistance: 900, totalCoins: 56 },
      settings: { sound: false, vibration: true, accessibilityButtons: true },
      bankedRunIds: ["r1"],
    };
    const raw = JSON.stringify({ v: 1, sum: checksum(JSON.stringify(v1)), data: v1 });
    const r = await loadSave(mem({ [SAVE_KEYS.main]: raw }));
    expect(r.status).toBe("migrated");
    expect(r.data.coins).toBe(56);
    expect(r.data.bestScore).toBe(911);
    expect(r.data.stats.totalRuns).toBe(3);
    expect(r.data.settings.sound).toBe(false);
    expect(r.data.gems).toBe(0);
    expect(r.data.eventIds).toContain("run:r1");
    expect(decodeSave(raw)?.data.version).toBe(2);
  });
});

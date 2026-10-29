/// <reference types="jest" />
import { bankRun } from "../economy";
import { checksum } from "../checksum";
import { corruptSave, decodeSave, encodeSave, KVStore, loadSave, SAVE_KEYS, writeSave } from "../saveManager";
import { defaultSave, SAVE_VERSION } from "../schema";

function memKV(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  const kv: KVStore & { m: Map<string, string> } = {
    m,
    get: async (k) => (m.has(k) ? m.get(k)! : null),
    set: async (k, v) => {
      m.set(k, v);
      return true;
    },
    remove: async (k) => {
      m.delete(k);
      return true;
    },
  };
  return kv;
}

describe("bank-once idempotency (Q-4)", () => {
  it("banks a run exactly once even if game-over fires repeatedly", () => {
    let save = defaultSave();
    const run = { runId: "r1", coins: 7, score: 300, distance: 230 };
    for (let i = 0; i < 5; i++) save = bankRun(save, run).save;
    expect(save.coins).toBe(7);
    expect(save.stats.totalRuns).toBe(1);
  });

  it("100 game-over/restart cycles: 0 duplicate grants", () => {
    let save = defaultSave();
    let expected = 0;
    for (let i = 0; i < 100; i++) {
      const run = { runId: `run-${i}`, coins: i % 9, score: i * 10, distance: i * 8 };
      expected += run.coins;
      save = bankRun(save, run).save;
      save = bankRun(save, run).save; // duplicate event
      save = bankRun(save, run).save;
    }
    expect(save.coins).toBe(expected);
    expect(save.stats.totalRuns).toBe(100);
    expect(save.stats.totalCoins).toBe(expected);
  });

  it("new best only when score exceeds saved best", () => {
    let save = defaultSave();
    const a = bankRun(save, { runId: "a", coins: 0, score: 50, distance: 50 });
    expect(a.newBest).toBe(true);
    save = a.save;
    const b = bankRun(save, { runId: "b", coins: 0, score: 20, distance: 20 });
    expect(b.newBest).toBe(false);
    expect(b.save.bestScore).toBe(50);
  });

  it("never goes negative on bad input", () => {
    const r = bankRun(defaultSave(), { runId: "x", coins: -5, score: NaN, distance: -1 });
    expect(r.save.coins).toBe(0);
    expect(r.save.bestScore).toBe(0);
  });
});

describe("save load / migration / corruption", () => {
  it("fresh install → defaults, status new", async () => {
    const r = await loadSave(memKV());
    expect(r.status).toBe("new");
    expect(r.data).toEqual(defaultSave());
  });

  it("round trip keeps best score, coins, stats and settings (Q-5)", async () => {
    const kv = memKV();
    const d = { ...defaultSave(), bestScore: 999, coins: 42, settings: { ...defaultSave().settings, sound: false, vibration: false, accessibilityButtons: true } };
    d.stats.totalRuns = 3;
    expect(await writeSave(kv, d)).toBe(true);
    expect(kv.m.has(SAVE_KEYS.tmp)).toBe(false); // temp swapped away
    for (let i = 0; i < 10; i++) {
      const r = await loadSave(kv);
      expect(r.status).toBe("ok");
      expect(r.data).toEqual(d);
    }
  });

  it("garbage main + marker → reset to defaults (toast case)", async () => {
    const kv = memKV({ [SAVE_KEYS.main]: "{not json", [SAVE_KEYS.marker]: "1" });
    const r = await loadSave(kv);
    expect(r.status).toBe("reset");
    expect(r.data).toEqual(defaultSave());
    expect((await loadSave(kv)).status).toBe("ok"); // repaired on disk
  });

  it("dev corruptSave → reset", async () => {
    const kv = memKV();
    await writeSave(kv, { ...defaultSave(), coins: 10 });
    await corruptSave(kv);
    expect((await loadSave(kv)).status).toBe("reset");
  });

  it("unreadable main (storage returned null) but marker present → reset", async () => {
    const kv = memKV({ [SAVE_KEYS.marker]: "1" });
    expect((await loadSave(kv)).status).toBe("reset");
  });

  it("checksum mismatch → rejected", () => {
    const enc = JSON.parse(encodeSave({ ...defaultSave(), coins: 5 }));
    enc.data.coins = 5000;
    expect(decodeSave(JSON.stringify(enc))).toBeNull();
  });

  it("invalid values (negative coins) with valid checksum → rejected", () => {
    const data = { ...defaultSave(), coins: -3 };
    const raw = JSON.stringify({ v: SAVE_VERSION, sum: checksum(JSON.stringify(data)), data });
    expect(decodeSave(raw)).toBeNull();
  });

  it("future version → rejected", () => {
    const data = defaultSave();
    const raw = JSON.stringify({ v: SAVE_VERSION + 1, sum: checksum(JSON.stringify(data)), data });
    expect(decodeSave(raw)).toBeNull();
  });

  it("interrupted write: corrupt main but valid temp → recovered", async () => {
    const good = encodeSave({ ...defaultSave(), coins: 77 });
    const kv = memKV({ [SAVE_KEYS.main]: good.slice(0, 20), [SAVE_KEYS.tmp]: good, [SAVE_KEYS.marker]: "1" });
    const r = await loadSave(kv);
    expect(r.status).toBe("recovered");
    expect(r.data.coins).toBe(77);
  });

  it("migrates legacy v0 save {best, coins}", async () => {
    const kv = memKV({ [SAVE_KEYS.main]: JSON.stringify({ best: 321, coins: 12 }) });
    const r = await loadSave(kv);
    expect(r.status).toBe("migrated");
    expect(r.data.bestScore).toBe(321);
    expect(r.data.coins).toBe(12);
    expect(r.data.version).toBe(SAVE_VERSION);
    expect((await loadSave(kv)).status).toBe("ok"); // rewritten in current format
  });
});

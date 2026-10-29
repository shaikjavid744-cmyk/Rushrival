import { BOARDS, CHARACTERS, DAILY_REWARDS, WORLDS } from "@/src/config/catalog";
import { applyLiveCatalog } from "../liveCatalog";

jest.mock("@/src/utils/storage", () => ({ storage: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => true) } }));

describe("published catalogue overrides bundled defaults", () => {
  it("applies prices, unlock levels and daily rewards; missing entries fall back to bundled", () => {
    const zoeBundled = { ...CHARACTERS.find((c) => c.id === "zoe")!.price };
    applyLiveCatalog({
      version: 7,
      items: { character: { zoe: { currency: "coins", amount: 1234 }, leo: "ad" }, board: { flame: null }, world: { beach: { currency: "coins", amount: 10 } } },
      unlock_levels: { world: { beach: 1 } },
      daily_rewards: [{ coins: 999 }, { coins: 400 }, { gems: 5 }, { coins: 800 }, { coins: 1200 }, { gems: 15 }, { gems: 40 }],
    });
    expect(CHARACTERS.find((c) => c.id === "zoe")!.price).toEqual({ currency: "coins", amount: 1234 });
    expect(CHARACTERS.find((c) => c.id === "leo")!.price).toEqual({ ad: true });
    expect(CHARACTERS.find((c) => c.id === "kai")!.price).toEqual({ currency: "coins", amount: 50000 }); // not in payload → bundled
    expect(BOARDS.find((b) => b.id === "flame")!.price).toBeNull();
    expect(WORLDS.find((w) => w.id === "beach")!.unlockLevel).toBe(1);
    expect(WORLDS.find((w) => w.id === "snow")!.unlockLevel).toBe(6);
    expect(DAILY_REWARDS[0]).toEqual({ currency: "coins", amount: 999 });
    // malformed daily list is ignored (keeps current table)
    applyLiveCatalog({ version: 8, items: { character: {} }, daily_rewards: [{ coins: 1 }] });
    expect(DAILY_REWARDS[0]).toEqual({ currency: "coins", amount: 999 });
    expect(zoeBundled).toEqual({ currency: "coins", amount: 25000 });
  });
});

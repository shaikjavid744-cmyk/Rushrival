import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "expo-router";

import { ToastMessage, ToastVariant } from "@/src/components/ui/ToastMessage";
import { BOARDS, CHARACTERS, CatalogItem, Currency, INBOX, SHOP_ITEMS, WELCOME_GIFT, WORLDS } from "@/src/config/catalog";
import { deviceKV } from "@/src/save/deviceKV";
import { applyTx, bankRun as bankRunPure, BankOutcome, claimDaily as claimDailyPure, levelInfo, markEvent, RunResult } from "@/src/save/economy";
import { corruptSave, LoadStatus, loadSave, SAVE_KEYS, writeSave } from "@/src/save/saveManager";
import { defaultSave, SaveData, SaveSettings } from "@/src/save/schema";
import { audio } from "@/src/services/audio";
import { haptics } from "@/src/services/haptics";
import { music } from "@/src/services/music";
import { online, uid } from "@/src/online/online";
import { claimGoal as claimGoalPure } from "@/src/save/missions";

export type ItemKind = "characters" | "boards" | "worlds";
export const CATALOG: Record<ItemKind, CatalogItem[]> = { characters: CHARACTERS, boards: BOARDS, worlds: WORLDS };
const EQUIP_KEY: Record<ItemKind, "character" | "board" | "world"> = { characters: "character", boards: "board", worlds: "world" };

/** Dev-only knobs (never active in release). */
export const devFlags = { failSaves: false, clockOffsetDays: 0 };
export const now = () => Date.now() + (__DEV__ ? devFlags.clockOffsetDays * 86400000 : 0);

interface ToastState {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface GameCtx {
  ready: boolean;
  save: SaveData;
  level: ReturnType<typeof levelInfo>;
  saveError: boolean;
  init: () => Promise<LoadStatus>;
  update: (fn: (s: SaveData) => SaveData) => void;
  updateSettings: (patch: Partial<SaveSettings>) => void;
  bankRun: (run: RunResult) => BankOutcome;
  purchase: (kind: ItemKind, id: string) => "ok" | "insufficient" | "owned";
  equip: (kind: ItemKind, id: string) => void;
  claimGift: () => boolean;
  claimDaily: () => number | null;
  consumeHoverboard: () => boolean;
  spend: (eventId: string, currency: Currency, amount: number, reason: string) => boolean;
  applyGrant: (eventId: string, g: { coins?: number; gems?: number; hoverboards?: number; items?: { characters?: string[]; boards?: string[] } }, reason: string) => boolean;
  claimGoal: (id: string) => boolean;
  claimInbox: (id: string) => boolean;
  markInboxRead: (id: string) => void;
  buyShopItem: (id: string) => "ok" | "insufficient" | "realMoney";
  resetProgress: () => Promise<void>;
  retrySave: () => void;
  showToast: (message: string, variant?: ToastVariant) => void;
  devCorruptSave: () => Promise<void>;
}

const Ctx = createContext<GameCtx | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [save, setSave] = useState<SaveData>(defaultSave);
  const [saveError, setSaveError] = useState(false);
  const saveRef = useRef<SaveData>(save);
  const readyRef = useRef(false);
  const writeChain = useRef<Promise<unknown>>(Promise.resolve());
  const [toast, setToast] = useState<ToastState | null>(null);
  // Toasts belong to the screen that raised them: dismiss on every route change.
  const pathname = usePathname();
  useEffect(() => setToast(null), [pathname]);

  const persist = useCallback((data: SaveData) => {
    writeChain.current = writeChain.current
      .then(async () => {
        // On failure the last good copy stays on disk (main key untouched when temp write fails).
        const ok = __DEV__ && devFlags.failSaves ? false : await writeSave(deviceKV, data);
        setSaveError(!ok);
      })
      .catch(() => setSaveError(true));
  }, []);

  const commit = useCallback(
    (next: SaveData) => {
      // Never write before the real save has loaded (would overwrite it with defaults).
      if (!readyRef.current) return;
      saveRef.current = next;
      setSave(next);
      persist(next);
    },
    [persist],
  );

  const update = useCallback((fn: (s: SaveData) => SaveData) => commit(fn(saveRef.current)), [commit]);

  const init = useCallback(async () => {
    setReady(false);
    readyRef.current = false;
    const { data, status } = await loadSave(deviceKV);
    saveRef.current = data;
    setSave(data);
    readyRef.current = true;
    setReady(true);
    return status;
  }, []);

  const updateSettings = useCallback((patch: Partial<SaveSettings>) => update((s) => ({ ...s, settings: { ...s.settings, ...patch } })), [update]);

  const bankRun = useCallback(
    (run: RunResult) => {
      const outcome = bankRunPure(saveRef.current, run, now());
      if (outcome.banked) commit(outcome.save);
      return outcome;
    },
    [commit],
  );

  const purchase = useCallback(
    (kind: ItemKind, id: string) => {
      const s = saveRef.current;
      if (s.owned[kind].includes(id)) return "owned" as const;
      const item = CATALOG[kind].find((i) => i.id === id);
      if (!item?.price || "ad" in item.price) return "insufficient" as const;
      const r = applyTx(s, { eventId: `buy:${kind}:${id}`, currency: item.price.currency, amount: -item.price.amount, reason: `buy-${id}`, now: now() });
      if (!r.ok) return "insufficient" as const;
      commit({ ...r.save, owned: { ...r.save.owned, [kind]: [...r.save.owned[kind], id] } });
      void online.enqueue("/purchases", { kind: String(kind).replace(/s$/, ""), item_id: id });
      return "ok" as const;
    },
    [commit],
  );

  const equip = useCallback((kind: ItemKind, id: string) => update((s) => (s.owned[kind].includes(id) ? { ...s, equipped: { ...s.equipped, [EQUIP_KEY[kind]]: id } } : s)), [update]);

  const claimGift = useCallback(() => {
    let s = saveRef.current;
    if (s.onboarding.giftClaimed || s.eventIds.includes("gift:welcome")) return false;
    s = applyTx(s, { eventId: "gift:welcome:coins", currency: "coins", amount: WELCOME_GIFT.coins, reason: "welcome-gift", now: now() }).save;
    s = applyTx(s, { eventId: "gift:welcome:gems", currency: "gems", amount: WELCOME_GIFT.gems, reason: "welcome-gift", now: now() }).save;
    s = markEvent(s, "gift:welcome");
    commit({ ...s, hoverboards: s.hoverboards + WELCOME_GIFT.hoverboards, onboarding: { ...s.onboarding, giftClaimed: true } });
    return true;
  }, [commit]);

  const claimDaily = useCallback(() => {
    const r = claimDailyPure(saveRef.current, now());
    if (!r.ok) return null;
    commit(r.save);
    void online.enqueue("/daily/claim");
    return r.day ?? null;
  }, [commit]);

  const consumeHoverboard = useCallback(() => {
    if (saveRef.current.hoverboards <= 0) return false;
    update((s) => ({ ...s, hoverboards: s.hoverboards - 1 })); // usage is counted by the run engine (powerupsUsed)
    void online.enqueue("/me/spend", { sink: "hoverboard", ref: uid() });
    return true;
  }, [update]);

  /** Ad / purchase grants (idempotent per eventId): currency via the ledger, plus hoverboards and items. */
  const applyGrant = useCallback(
    (eventId: string, g: { coins?: number; gems?: number; hoverboards?: number; items?: { characters?: string[]; boards?: string[] } }, reason: string) => {
      let s = saveRef.current;
      if (s.eventIds.includes(eventId)) return false;
      for (const cur of ["coins", "gems"] as const) {
        const amount = g[cur];
        if (!amount) continue;
        const r = applyTx(s, { eventId: `${eventId}:${cur}`, currency: cur, amount, reason, now: now() });
        if (r.ok) s = r.save;
      }
      const add = (have: string[], more?: string[]) => [...new Set([...have, ...(more ?? [])])];
      s = { ...s, hoverboards: s.hoverboards + (g.hoverboards ?? 0), owned: { ...s.owned, characters: add(s.owned.characters, g.items?.characters), boards: add(s.owned.boards, g.items?.boards) } };
      commit(markEvent(s, eventId));
      return true;
    },
    [commit],
  );

  const spend = useCallback(
    (eventId: string, currency: Currency, amount: number, reason: string) => {
      const r = applyTx(saveRef.current, { eventId, currency, amount: -Math.abs(amount), reason, now: now() });
      if (r.ok) commit(r.save);
      if (r.ok && reason === "revive") void online.enqueue("/me/spend", { sink: "revive", ref: eventId });
      return r.ok;
    },
    [commit],
  );

  const claimGoal = useCallback(
    (id: string) => {
      const r = claimGoalPure(saveRef.current, id, now());
      if (r.ok) commit(r.save);
      return r.ok;
    },
    [commit],
  );

  const claimInbox = useCallback(
    (id: string) => {
      const m = INBOX.find((x) => x.id === id);
      if (!m?.reward) return false;
      const r = applyTx(saveRef.current, { eventId: `inbox:${id}`, currency: m.reward.currency, amount: m.reward.amount, reason: `inbox-${id}`, now: now() });
      if (r.ok) commit(markEvent(r.save, `inbox-read:${id}`));
      if (r.ok) void online.enqueue(`/inbox/${id}/claim`);
      return r.ok;
    },
    [commit],
  );

  const markInboxRead = useCallback((id: string) => update((s) => markEvent(s, `inbox-read:${id}`)), [update]);

  const buyShopItem = useCallback(
    (id: string) => {
      const item = SHOP_ITEMS.find((x) => x.id === id);
      if (!item || "realMoney" in item.cost) return "realMoney" as const;
      const nonce = `shop:${id}:${now().toString(36)}:${Math.floor(Math.random() * 1e6).toString(36)}`;
      const paid = applyTx(saveRef.current, { eventId: `${nonce}:cost`, currency: item.cost.currency, amount: -item.cost.amount, reason: `shop-${id}`, now: now() });
      if (!paid.ok) return "insufficient" as const;
      let next = paid.save;
      if (item.grant.kind === "hoverboards") next = markEvent({ ...next, hoverboards: next.hoverboards + item.grant.amount }, `${nonce}:grant`);
      else next = applyTx(next, { eventId: `${nonce}:grant`, currency: item.grant.kind, amount: item.grant.amount, reason: `shop-${id}`, now: now() }).save;
      commit(next);
      void online.enqueue("/purchases", { kind: "shop", item_id: id });
      return "ok" as const;
    },
    [commit],
  );

  const resetProgress = useCallback(async () => {
    await writeChain.current;
    await Promise.all([deviceKV.remove(SAVE_KEYS.main), deviceKV.remove(SAVE_KEYS.tmp), deviceKV.remove(SAVE_KEYS.marker)]);
    const fresh = defaultSave();
    saveRef.current = fresh;
    setSave(fresh);
  }, []);

  const retrySave = useCallback(() => persist(saveRef.current), [persist]);

  const showToast = useCallback((message: string, variant: ToastVariant = "info") => setToast({ id: Date.now(), message, variant }), []);

  const devCorruptSave = useCallback(async () => {
    if (!__DEV__) return;
    await writeChain.current;
    await corruptSave(deviceKV);
  }, []);

  useEffect(() => {
    audio.enabled = save.settings.sound;
    haptics.enabled = save.settings.vibration;
    music.setEnabled(ready && save.settings.music);
  }, [save.settings.sound, save.settings.vibration, save.settings.music, ready]);

  const level = useMemo(() => levelInfo(save.xp), [save.xp]);
  const value = useMemo(
    () => ({ ready, save, level, saveError, init, update, updateSettings, bankRun, purchase, equip, claimGift, claimDaily, consumeHoverboard, spend, applyGrant, claimGoal, claimInbox, markInboxRead, buyShopItem, resetProgress, retrySave, showToast, devCorruptSave }),
    [ready, save, level, saveError, init, update, updateSettings, bankRun, purchase, equip, claimGift, claimDaily, consumeHoverboard, spend, applyGrant, claimGoal, claimInbox, markInboxRead, buyShopItem, resetProgress, retrySave, showToast, devCorruptSave],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {toast ? <ToastMessage key={toast.id} message={toast.message} variant={toast.variant} onHide={() => setToast(null)} /> : null}
    </Ctx.Provider>
  );
}

export function useGame(): GameCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useGame must be used inside GameProvider");
  return c;
}

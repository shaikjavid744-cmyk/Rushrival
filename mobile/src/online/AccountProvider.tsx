import Constants from "expo-constants";
import { useRouter } from "expo-router";
import React, { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";

import { useGame } from "@/src/state/GameProvider";
import { defaultSave } from "@/src/save/schema";

import { LiveCatalog, loadCachedCatalog, storeLiveCatalog } from "./liveCatalog";
import { ApiErr, online } from "./online";

export interface RemoteConfig {
  version: number;
  maintenance: boolean;
  min_supported_version: string;
  latest_version: string;
  store_url?: string;
  flags: { events: boolean; leaderboard: boolean; shop: boolean };
}
/** Safe bundled defaults — used until (and whenever) the server can't be reached. */
export const DEFAULT_CONFIG: RemoteConfig = { version: 0, maintenance: false, min_supported_version: "1.0.0", latest_version: "1.0.0", flags: { events: true, leaderboard: true, shop: true } };
export const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";

export function cmpVersion(a: string, b: string) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1;
  return 0;
}

interface Ctx {
  user: any;
  signedIn: boolean;
  syncStatus: typeof online.status;
  pending: number;
  config: RemoteConfig;
  configLoaded: boolean;
  reloadConfig: () => Promise<void>;
  retrySync: () => void;
  /** After sign-in: link guest progress. Returns the conflict details if both sides have progress. */
  linkProgress: (choice?: "cloud" | "device") => Promise<{ conflict?: any }>;
  signOut: () => Promise<void>;
}
const AccountCtx = createContext<Ctx | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const { save, update, showToast } = useGame();
  const [config, setConfig] = useState<RemoteConfig>(DEFAULT_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(false);
  const snap = useSyncExternalStore(
    (f) => online.subscribe(f),
    () => `${online.signedIn}|${online.status}|${online.queue.length}|${online.user?.user_id ?? ""}|${JSON.stringify(online.user?.wallet ?? {})}`,
  );
  const router = useRouter();

  const reloadConfig = useCallback(async () => {
    await loadCachedCatalog();
    try {
      setConfig({ ...DEFAULT_CONFIG, ...(await online.request<RemoteConfig>("/config", { auth: false })) });
      await storeLiveCatalog(await online.request<LiveCatalog>("/catalog", { auth: false }));
    } catch {
      /* keep bundled defaults (or the last cached published catalogue) */
    }
    setConfigLoaded(true);
  }, []);

  useEffect(() => {
    // Server is authoritative for signed-in balances + inventory (local XP/level stays as is).
    online.onServerUser = (u) =>
      update((s) => ({
        ...s,
        coins: u.wallet.coins,
        gems: u.wallet.gems,
        hoverboards: u.wallet.hoverboards,
        owned: { characters: u.inventory.character ?? s.owned.characters, boards: u.inventory.board ?? s.owned.boards, worlds: u.inventory.world ?? s.owned.worlds },
      }));
    // Any sign-out (manual, deletion, revoked session): the local wallet/inventory is cloud-derived, so the
    // device returns to a fresh guest economy — otherwise it could be "linked" into another account.
    online.onSignedOut = () =>
      update((s) => {
        const d = defaultSave();
        return { ...s, coins: d.coins, gems: d.gems, hoverboards: d.hoverboards, owned: d.owned, equipped: d.equipped };
      });
    // On launch: flush anything queued, then refresh the server wallet (flush only pulls when it sent ops).
    online.init().then(async () => {
      await online.flush();
      if (online.signedIn && online.queue.length === 0) await online.pull().catch(() => undefined);
    });
    reloadConfig();
    const sync = () => online.flush();
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener("online", sync);
      return () => window.removeEventListener("online", sync);
    }
    return NetInfo.addEventListener((st) => st.isConnected && sync());
  }, [reloadConfig, update]);

  // "Synced" toast when a non-empty queue finishes.
  const [prevStatus, setPrevStatus] = useState(online.status);
  useEffect(() => {
    if (online.status !== prevStatus) {
      if (online.status === "synced" && prevStatus === "syncing") showToast("Synced", "success");
      setPrevStatus(online.status);
    }
  }, [snap, prevStatus, showToast]);

  // Notification / ad-personalisation preferences are stored server-side for signed-in players.
  const notif = save.settings.notifications;
  const ads = !!save.settings.adPersonalisation;
  const signedInNow = online.signedIn;
  useEffect(() => {
    if (signedInNow) online.request("/me/preferences", { method: "PUT", body: { notifications: notif, ad_personalisation: ads } }).catch(() => undefined);
  }, [notif, ads, signedInNow]);

  const linkProgress = useCallback(
    async (choice?: "cloud" | "device") => {
      const local = { coins: save.coins, gems: save.gems, hoverboards: save.hoverboards, xp: save.xp, best_score: save.bestScore, inventory: { character: save.owned.characters, board: save.owned.boards, world: save.owned.worlds }, equipped: save.equipped };
      try {
        const r = await online.request<{ user: any }>("/me/link", { method: "POST", body: { local, choice } });
        await online.setUser(r.user);
        online.onServerUser?.(r.user);
        return {};
      } catch (e) {
        const er = e as ApiErr;
        if (er.code === "progress_conflict") return { conflict: er.details };
        throw e;
      }
    },
    [save],
  );

  const signOut = useCallback(async () => {
    const rt = online.tokens?.refresh_token;
    if (rt) await online.request("/auth/logout", { method: "POST", body: { refresh_token: rt } }).catch(() => undefined);
    await online.clearSession();
    if (router.canDismiss()) router.dismissAll();
    router.replace("/menu");
  }, [router]);

  const value: Ctx = {
    user: online.user,
    signedIn: online.signedIn,
    syncStatus: online.status,
    pending: online.queue.length,
    config,
    configLoaded,
    reloadConfig,
    retrySync: () => void online.flush(),
    linkProgress,
    signOut,
  };
  return <AccountCtx.Provider value={value}>{children}</AccountCtx.Provider>;
}

export function useAccount(): Ctx {
  const c = useContext(AccountCtx);
  if (!c) throw new Error("useAccount outside AccountProvider");
  return c;
}

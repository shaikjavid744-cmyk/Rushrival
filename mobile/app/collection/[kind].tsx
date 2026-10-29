import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState, useSyncExternalStore } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConfirmationDialog } from "@/src/components/ui/ConfirmationDialog";
import { ItemCard, ItemState } from "@/src/components/ui/ItemCard";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import type { CatalogItem } from "@/src/config/catalog";
import { CATALOG, ItemKind, useGame } from "@/src/state/GameProvider";
import { AD_UNLOCK_TARGET } from "@/src/monetization/products";
import { monStore } from "@/src/monetization/store";
import { online, uid } from "@/src/online/online";
import { ads } from "@/src/services/ads";
import { fonts, makeStyles, radius, spacing } from "@/src/theme";

const TITLES: Record<ItemKind, string> = { characters: "Characters", boards: "Boards", worlds: "Worlds" };
const EQ: Record<ItemKind, "character" | "board" | "world"> = { characters: "character", boards: "board", worlds: "world" };

export default function Collection() {
  const s = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { kind: raw } = useLocalSearchParams<{ kind: string }>();
  const kind: ItemKind = raw === "boards" || raw === "worlds" ? raw : "characters";
  const { save, level, purchase, equip, showToast, applyGrant } = useGame();
  const [pending, setPending] = useState<CatalogItem | null>(null);

  const stateOf = (it: CatalogItem): ItemState => (save.equipped[EQ[kind]] === it.id ? "selected" : save.owned[kind].includes(it.id) ? "owned" : "locked");
  const levelLock = (it: CatalogItem) => (it.unlockLevel && level.level < it.unlockLevel ? `Lv ${it.unlockLevel}` : undefined);
  const mon = useSyncExternalStore(monStore.subscribe, monStore.get);
  const adProgress = (it: CatalogItem) => mon.adUnlock[`${kind}:${it.id}`] ?? 0;

  /** Leo / Galaxy: unlock after AD_UNLOCK_TARGET completed rewarded views (progress counter). */
  const watchUnlock = async (it: CatalogItem) => {
    const out = await ads.showRewarded("unlock");
    if (out === "closed_early") return showToast("Watch the full video to get the reward", "info");
    if (out !== "earned") return showToast("Ad not available right now — try again", "error");
    const key = `${kind}:${it.id}`;
    const eventId = `adunl:${key}:${uid()}`;
    if (!monStore.markGranted(eventId)) return;
    const n = adProgress(it) + 1;
    await monStore.set({ adUnlock: { ...monStore.get().adUnlock, [key]: n } });
    if (online.signedIn) void online.enqueue("/ads/reward", { placement: "unlock", event_id: eventId, item_kind: kind === "characters" ? "character" : "board", item_id: it.id });
    if (n >= AD_UNLOCK_TARGET) {
      applyGrant(`adunlock:${key}`, { items: { [kind]: [it.id] } }, "ad_unlock");
      showToast(`${it.name} unlocked!`, "success");
    } else showToast(`${it.name}: ${n}/${AD_UNLOCK_TARGET} ads watched`, "success");
  };

  const onTap = (it: CatalogItem) => {
    const st = stateOf(it);
    if (st !== "locked") {
      equip(kind, it.id);
      showToast(`${it.name} selected`, "success");
      return;
    }
    if (it.price && "ad" in it.price) return void watchUnlock(it);
    const lv = levelLock(it);
    if (lv) return showToast(`Reach ${lv} to unlock ${it.name}.`, "info");
    setPending(it);
  };

  const price = pending?.price && !("ad" in pending.price) ? pending.price : null;
  const affordable = price ? save[price.currency] >= price.amount : false;
  const cur = price?.currency === "gems" ? "gems" : "coins";

  return (
    <View style={s.root} testID={`collection-${kind}`}>
      <ScreenHeader title={TITLES[kind]} testID="collection-header" />
      <FlatList
        data={CATALOG[kind]}
        numColumns={3}
        keyExtractor={(i) => i.id}
        columnWrapperStyle={s.gridRow}
        contentContainerStyle={s.grid}
        renderItem={({ item }) => (
          <ItemCard item={item} state={stateOf(item)} lockedReason={stateOf(item) === "locked" ? (item.price && "ad" in item.price ? `${adProgress(item)}/${AD_UNLOCK_TARGET} ads` : levelLock(item)) : undefined} wide={kind === "worlds"} onPress={() => onTap(item)} testID={`item-${item.id}`} />
        )}
      />
      <View style={[s.tabs, { paddingBottom: insets.bottom + spacing.sm }]}>
        {(Object.keys(TITLES) as ItemKind[]).map((k) => (
          <Pressable key={k} onPress={() => router.setParams({ kind: k })} style={[s.tab, k === kind && s.tabOn]} testID={`collection-tab-${k}`} accessibilityRole="tab" accessibilityState={{ selected: k === kind }} aria-selected={k === kind}>
            <Text style={[s.tabText, k === kind && s.tabTextOn]}>{TITLES[k]}</Text>
          </Pressable>
        ))}
      </View>
      {pending && price ? (
        <ConfirmationDialog
          testID="purchase-dialog"
          title={pending.name}
          message={affordable ? `Buy for ${price.amount.toLocaleString()} ${cur}${cur === "gems" ? " (premium currency)" : ""}?${save.onboarding.childMode ? " Ask a parent before buying." : ""}` : `Not enough ${cur}. Price: ${price.amount.toLocaleString()} ${cur}.`}
          confirmLabel={affordable ? "Buy" : `Not enough ${cur}`}
          confirmDisabled={!affordable}
          onConfirm={() => {
            if (purchase(kind, pending.id) === "ok") {
              equip(kind, pending.id);
              showToast(`${pending.name} unlocked & selected!`, "success");
            }
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  grid: { padding: spacing.md, gap: spacing.md },
  gridRow: { gap: spacing.md },
  tabs: { flexDirection: "row", borderTopWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, paddingTop: spacing.sm, paddingHorizontal: spacing.sm, gap: spacing.sm },
  tab: { flex: 1, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: c.brandPrimary },
  tabText: { fontFamily: fonts.display, fontSize: 15, color: c.muted },
  tabTextOn: { color: c.onBrandPrimary },
}));

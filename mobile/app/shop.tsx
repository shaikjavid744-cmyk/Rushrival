import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/src/components/ui/PrimaryButton";
import { RewardDialog } from "@/src/components/ui/RewardDialog";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { SecondaryButton } from "@/src/components/ui/SecondaryButton";
import { SHOP_ITEMS, ShopItem } from "@/src/config/catalog";
import { UI_IMAGES } from "@/src/game/sprites";
import { PurchaseState } from "@/src/monetization/billingCore";
import { TEST_MODE_LABEL } from "@/src/monetization/mockBus";
import { ParentalGate } from "@/src/monetization/ParentalGate";
import { Product, PRODUCTS, ProductTab } from "@/src/monetization/products";
import { monStore } from "@/src/monetization/store";
import { billing } from "@/src/services/billing";
import { useGame } from "@/src/state/GameProvider";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const TABS: { id: ProductTab; label: string }[] = [
  { id: "coins", label: "Coins" },
  { id: "gems", label: "Gems" },
  { id: "offers", label: "Offers" },
];
const TEXT: Record<PurchaseState["kind"], [string, string]> = {
  processing: ["Processing…", "Waiting for Google Play."],
  success: ["Purchase successful", "Your items were added."],
  cancelled: ["Purchase cancelled", "Nothing was charged."],
  failed: ["Purchase failed", ""],
  pending: ["Purchase pending", "Purchase pending — you'll get your items when payment completes."],
  already_owned: ["Already owned", "You already own this item."],
  store_unavailable: ["Store unavailable", "Google Play can't be reached right now. Nothing was charged."],
  deferred: ["We'll finish your purchase shortly", "Your payment went through. We'll add your items as soon as it's verified (we retry on next launch)."],
};
type Row = { kind: "product"; p: Product } | { kind: "trade"; item: ShopItem };

export default function Shop() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { save, buyShopItem, showToast } = useGame();
  const mon = useSyncExternalStore(monStore.subscribe, monStore.get);
  const [tab, setTab] = useState<ProductTab>("gems");
  const [prices, setPrices] = useState<Record<string, string> | null | undefined>(undefined);
  const [st, setSt] = useState<{ state: PurchaseState; productId: string } | null>(null);
  const [gateFor, setGateFor] = useState<Product | null>(null);
  const [reward, setReward] = useState<ShopItem | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const child = save.onboarding.childMode;

  const loadPrices = useCallback(async () => {
    setPrices(undefined);
    billing.mock?.setStoreDown(false);
    setPrices(await billing.prices());
  }, []);
  useEffect(() => {
    void loadPrices();
    billing.onLateResult((kind) => {
      setPendingCount(billing.mock?.pendingCount() ?? 0);
      if (kind === "success") setSt((cur) => ({ state: { kind: "success", productId: cur?.productId ?? "" }, productId: cur?.productId ?? "" }));
    });
    return () => billing.onLateResult(null);
  }, [loadPrices]);

  const owned = (p: Product) => !p.consumable && (p.grant.entitlements ?? []).some((e) => mon.entitlements.includes(e));

  const buy = async (p: Product) => {
    setSt({ state: { kind: "processing" }, productId: p.id });
    const r = await billing.buy(p.id);
    setSt({ state: r, productId: p.id });
    setPendingCount(billing.mock?.pendingCount() ?? 0);
    if (r.kind === "store_unavailable") setPrices(null);
  };
  const onBuy = (p: Product) => (owned(p) ? setSt({ state: { kind: "already_owned" }, productId: p.id }) : child ? setGateFor(p) : void buy(p));

  const restore = async () => {
    setSt({ state: { kind: "processing" }, productId: "restore" });
    const n = await billing.restore();
    setSt(null);
    if (n === "store_unavailable") setPrices(null);
    else showToast(`Restored ${n} purchase${n === 1 ? "" : "s"}`, n ? "success" : "info");
  };

  const rows: Row[] = [
    ...PRODUCTS.filter((p) => p.tab === tab).map((p) => ({ kind: "product" as const, p })),
    ...(tab === "coins" ? SHOP_ITEMS.filter((i) => !("realMoney" in i.cost)).map((item) => ({ kind: "trade" as const, item })) : []),
  ];

  const header = (
    <View style={{ gap: spacing.sm }}>
      {billing.isMock ? (
        <View style={s.test} testID="shop-test-mode">
          <Ionicons name="flask" size={16} color={colors.surface} />
          <Text style={s.testText}>{TEST_MODE_LABEL}</Text>
        </View>
      ) : null}
      <Text style={s.note}>
        Hoverboards owned: <Text style={s.noteStrong} testID="shop-hoverboards">{save.hoverboards}</Text>
        {child ? "  ·  A grown-up must approve purchases." : ""}
      </Text>
      {prices === null ? (
        <View style={s.unavail} testID="shop-store-unavailable">
          <Text style={s.title}>Store unavailable</Text>
          <Text style={s.note}>Google Play can't be reached. Gem trades still work.</Text>
          <PrimaryButton label="Retry" onPress={() => void loadPrices()} testID="shop-store-retry" />
        </View>
      ) : null}
      {pendingCount > 0 && billing.mock ? (
        <SecondaryButton label={`Complete pending payment (TEST) · ${pendingCount}`} onPress={() => billing.mock?.completePending()} testID="shop-complete-pending" />
      ) : null}
    </View>
  );

  return (
    <View style={s.root} testID="shop-screen">
      <ScreenHeader title="Shop" testID="shop-header" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsRow} contentContainerStyle={s.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.id} onPress={() => setTab(t.id)} hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }} style={[s.chip, tab === t.id && s.chipOn]} testID={`shop-tab-${t.id}`} accessibilityRole="tab" accessibilityState={{ selected: tab === t.id }}>
            <Text style={s.chipText}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <FlatList
        data={rows}
        keyExtractor={(r) => (r.kind === "product" ? r.p.id : r.item.id)}
        contentContainerStyle={[s.list, { paddingBottom: insets.bottom + spacing.lg }]}
        ListHeaderComponent={header}
        ListFooterComponent={<SecondaryButton label="Restore purchases" icon="refresh" onPress={() => void restore()} testID="shop-restore" />}
        renderItem={({ item: r }) => {
          if (r.kind === "trade") {
            const it = r.item;
            const cost = it.cost as { currency: "coins" | "gems"; amount: number };
            return (
              <View style={s.card} testID={`shop-item-${it.id}`}>
                <View style={s.icon}>{it.icon === "ellipse" ? <Image source={UI_IMAGES.coin} style={{ width: 40, height: 40 }} /> : <Ionicons name={it.icon} size={34} color={colors.accent} />}</View>
                <Text style={s.title}>{it.title}</Text>
                <Pressable onPress={() => (buyShopItem(it.id) === "ok" ? setReward(it) : showToast(`Not enough ${cost.currency}`, "error"))} style={s.buy} testID={`shop-buy-${it.id}`} accessibilityRole="button" accessibilityLabel={`Buy ${it.title}`}>
                  <Ionicons name={cost.currency === "gems" ? "diamond" : "ellipse"} size={14} color={cost.currency === "gems" ? colors.gem : colors.gold} />
                  <Text style={s.buyText}>{cost.amount.toLocaleString()}</Text>
                </Pressable>
              </View>
            );
          }
          const p = r.p;
          const isOwned = owned(p);
          const price = prices?.[p.id] ?? p.fallbackPrice;
          return (
            <View style={s.card} testID={`shop-item-${p.id}`}>
              <View style={s.icon}>{p.icon === "ellipse" ? <Image source={UI_IMAGES.coin} style={{ width: 40, height: 40 }} /> : <Ionicons name={p.icon} size={34} color={p.icon === "diamond" ? colors.gem : colors.accent} />}</View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.title}>{p.title}</Text>
                {p.subtitle ? <Text style={s.sub}>{p.subtitle}</Text> : null}
                <Text style={s.paid}>Paid · real money</Text>
              </View>
              <Pressable onPress={() => onBuy(p)} disabled={isOwned || prices === null} style={[s.buy, s.buyReal, (isOwned || prices === null) && { opacity: 0.5 }]} testID={`shop-buy-${p.id}`} accessibilityRole="button" accessibilityLabel={isOwned ? `${p.title} already owned` : `Buy ${p.title} for ${price}`} accessibilityState={{ disabled: isOwned }}>
                <Text style={s.buyText} testID={`shop-price-${p.id}`}>{isOwned ? "Already owned" : price}</Text>
              </Pressable>
            </View>
          );
        }}
      />
      {gateFor ? (
        <ParentalGate
          onPass={() => {
            const p = gateFor;
            setGateFor(null);
            void buy(p);
          }}
          onCancel={() => setGateFor(null)}
        />
      ) : null}
      {st ? (
        <View style={[StyleSheet.absoluteFill, s.scrim]} testID="purchase-state-dialog">
          <View style={s.dialog}>
            {billing.isMock ? <Text style={s.testInline}>{TEST_MODE_LABEL}</Text> : null}
            {st.state.kind === "processing" ? <ActivityIndicator color={colors.gold} testID="purchase-processing" /> : null}
            <Text style={s.dTitle} testID="purchase-state-title">{TEXT[st.state.kind][0]}</Text>
            <Text style={s.note} testID="purchase-state-body">{st.state.kind === "failed" ? st.state.reason : TEXT[st.state.kind][1]}</Text>
            {st.state.kind === "failed" ? <PrimaryButton label="Retry" onPress={() => { const p = PRODUCTS.find((x) => x.id === st.productId); if (p) void buy(p); }} testID="purchase-retry" /> : null}
            {st.state.kind === "store_unavailable" ? <PrimaryButton label="Retry" onPress={() => { setSt(null); void loadPrices(); }} testID="purchase-store-retry" /> : null}
            {st.state.kind !== "processing" ? <SecondaryButton label="Close" onPress={() => setSt(null)} testID="purchase-state-close" /> : null}
          </View>
        </View>
      ) : null}
      {reward ? <RewardDialog title="Purchased!" reward={{ currency: reward.grant.kind, amount: reward.grant.amount }} onClose={() => setReward(null)} testID="shop-reward-dialog" /> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  tabsRow: { flexGrow: 0, height: 56 },
  tabs: { gap: spacing.sm, paddingHorizontal: spacing.md, alignItems: "center", height: 56 },
  chip: { height: 36, flexShrink: 0, paddingHorizontal: spacing.md, borderRadius: 18, borderWidth: 2, borderColor: c.border, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  chipOn: { borderColor: c.gold, backgroundColor: c.brandPrimary },
  chipText: { fontFamily: fonts.bodyHeavy, fontSize: 14, color: c.onSurface },
  list: { padding: spacing.md, gap: spacing.sm },
  test: { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: c.warning, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  testText: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: c.surface },
  testInline: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: c.warning },
  note: { fontFamily: fonts.bodyHeavy, fontSize: 13, color: c.muted },
  noteStrong: { color: c.accent },
  unavail: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 2, borderColor: c.warning, backgroundColor: c.surfaceSecondary },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 2, borderColor: c.brandPrimary, padding: spacing.md },
  icon: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 17, color: c.onSurface },
  sub: { fontFamily: fonts.body, fontSize: 12, color: c.muted },
  paid: { fontFamily: fonts.bodyHeavy, fontSize: 11, color: c.warning },
  buy: { flexDirection: "row", alignItems: "center", gap: 4, height: 44, minWidth: 90, justifyContent: "center", borderRadius: radius.md, backgroundColor: c.success, paddingHorizontal: spacing.sm, borderBottomWidth: 4, borderBottomColor: c.surface },
  buyReal: { backgroundColor: c.brandPrimary },
  buyText: { fontFamily: fonts.display, fontSize: 14, color: c.onSurface },
  scrim: { backgroundColor: c.overlayScrim, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  dialog: { width: "100%", maxWidth: 360, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 2, borderColor: c.borderStrong, padding: spacing.lg, gap: spacing.sm },
  dTitle: { fontFamily: fonts.display, fontSize: 22, color: c.onSurface },
}));

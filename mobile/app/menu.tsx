import { Image } from "expo-image";
import { Redirect, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { BackHandler, Platform, Pressable, Text, useWindowDimensions, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConfirmationDialog } from "@/src/components/ui/ConfirmationDialog";
import { PrimaryButton } from "@/src/components/ui/PrimaryButton";
import { HERO_IMAGES, INBOX } from "@/src/config/catalog";
import { UI_IMAGES } from "@/src/game/sprites";
import { useBackAction } from "@/src/hooks/useBackAction";
import { dailyStatus } from "@/src/save/economy";
import { readyGoalCount } from "@/src/save/missions";
import { t } from "@/src/i18n";
import { now, useGame } from "@/src/state/GameProvider";
import { useAccount } from "@/src/online/AccountProvider";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Icon = React.ComponentProps<typeof Ionicons>["name"];

function SquareButton({ icon, label, onPress, testID, badge }: { icon: Icon; label: string; onPress: () => void; testID: string; badge?: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [s.square, pressed && { transform: [{ scale: 0.94 }] }]}>
      <Ionicons name={icon} size={26} color={colors.accent} />
      <Text style={s.squareLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{label}</Text>
      {badge ? <View style={s.badge} /> : null}
    </Pressable>
  );
}

export default function MainMenu() {
  const s = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { ready, save, level, devCorruptSave, showToast, saveError, retrySave } = useGame();
  const { signedIn } = useAccount();
  const { height: winH } = useWindowDimensions();
  const heroH = Math.max(120, Math.min(250, winH * (winH < 700 ? 0.23 : 0.27)));
  const [exitOpen, setExitOpen] = useState(false);
  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(withSequence(withTiming(-8, { duration: 700 }), withTiming(0, { duration: 700 })), -1);
  }, [bob]);
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));
  useBackAction(() => setExitOpen((o) => !o));

  if (!ready) return <Redirect href="/" />;
  if (!save.onboarding.done) return <Redirect href="/onboarding" />;
  const hero = HERO_IMAGES[save.equipped.character] ?? HERO_IMAGES.rush;
  const dailyReady = dailyStatus(save, now()).canClaim;
  const lang = save.settings.language;
  const goalsReady = readyGoalCount(save);
  const unread = INBOX.filter((m) => !save.eventIds.includes(`inbox-read:${m.id}`)).length;

  return (
    <View style={s.root} testID="main-menu">
      <Image source={UI_IMAGES.bg} style={s.fill} contentFit="cover" />
      <View style={[s.fill, s.shade]} />
      <View style={[s.content, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md }]}>
        <View style={s.topBar}>
          <Pressable style={s.player} onPress={() => router.push("/profile")} testID="menu-player-card" accessibilityRole="button" accessibilityLabel={`Profile. ${save.name}, level ${level.level}`}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{save.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View>
              <Text style={s.playerName} testID="menu-player-name">{save.name}</Text>
              <Text style={s.lv} testID="menu-level">Lv {level.level}</Text>
              <View style={s.xpBg}><View style={[s.xp, { width: `${Math.round((level.into / level.need) * 100)}%` }]} /></View>
            </View>
          </Pressable>
          <Pressable style={s.accountBtn} onPress={() => router.push("/account")} testID="menu-account-button" accessibilityRole="button" accessibilityLabel={t("account", lang)} hitSlop={6}>
            <Ionicons name={signedIn ? "cloud-done" : "cloud-upload-outline"} size={22} color={signedIn ? colors.success : colors.onSurface} />
          </Pressable>
          <View style={s.wallet}>
            <Pressable style={s.pill} onLongPress={__DEV__ ? async () => { await devCorruptSave(); router.replace("/"); setTimeout(() => showToast("DEV: save corrupted, relaunching...", "error"), 350); } : undefined} delayLongPress={3000} testID="menu-coin-balance" accessibilityLabel={`Coins ${save.coins}`}>
              <Image source={UI_IMAGES.coin} style={s.coin} />
              <Text style={s.coins} testID="menu-coin-balance-value">{save.coins.toLocaleString()}</Text>
            </Pressable>
            <View style={s.pill} testID="menu-gem-balance" accessibilityLabel={`Gems (premium currency) ${save.gems}`}>
              <Ionicons name="diamond" size={20} color={colors.gem} />
              <Text style={s.gems} testID="menu-gem-balance-value">{save.gems.toLocaleString()}</Text>
              <Pressable onPress={() => router.push("/shop")} style={s.plus} testID="menu-add-currency-button" accessibilityRole="button" accessibilityLabel="Open shop" hitSlop={8}>
                <Ionicons name="add" size={16} color={colors.onSurface} />
              </Pressable>
            </View>
          </View>
        </View>
        <Text style={s.best}>{t("best", lang)} <Text style={s.bestValue} testID="menu-best-score">{save.bestScore.toLocaleString()}</Text></Text>

        <Animated.View entering={FadeInDown.duration(400)} style={s.stage}>
          <View style={s.col}>
            <SquareButton icon="trophy" label={t("missions", lang)} onPress={() => router.push("/missions")} testID="menu-missions-button" badge={goalsReady > 0} />
            <SquareButton icon="calendar" label={t("daily", lang)} onPress={() => router.push("/daily")} testID="menu-daily-button" badge={dailyReady} />
            <SquareButton icon="cart" label={t("shop", lang)} onPress={() => router.push("/shop")} testID="menu-shop-button" />
          </View>
          <View style={s.center}>
            <Image source={UI_IMAGES.logo} style={s.logo} contentFit="contain" accessibilityLabel="Rush Rivals" />
            <Animated.View style={bobStyle}>
              <Image source={hero} style={{ height: heroH, width: heroH * 0.6 }} contentFit="contain" accessibilityLabel="Equipped character" />
            </Animated.View>
          </View>
          <View style={s.col}>
            <SquareButton icon="person" label={t("characters", lang)} onPress={() => router.push("/collection/characters")} testID="menu-characters-button" />
            <SquareButton icon="flash" label={t("boards", lang)} onPress={() => router.push("/collection/boards")} testID="menu-boards-button" />
            <SquareButton icon="earth" label={t("worlds", lang)} onPress={() => router.push("/collection/worlds")} testID="menu-worlds-button" />
          </View>
        </Animated.View>

        <View style={s.bottom}>
          {saveError ? (
            <Pressable style={s.saveErr} onPress={retrySave} testID="save-error-banner" accessibilityRole="button">
              <Ionicons name="cloud-offline" size={18} color={colors.onError} />
              <Text style={s.saveErrText}>Couldn&apos;t save progress — Retry</Text>
            </Pressable>
          ) : null}
          <PrimaryButton label={t("play", lang)} variant="gold" size="xl" icon="play" heavyHaptic onPress={() => router.replace("/run")} testID="play-button" />
          <View style={s.bar}>
            <SquareButton icon="podium" label={t("leaderboard", lang)} onPress={() => router.push("/leaderboard")} testID="menu-leaderboard-button" />
            <SquareButton icon="ribbon" label={t("events", lang)} onPress={() => router.push("/events")} testID="menu-events-button" />
            <SquareButton icon="settings" label={t("settings", lang)} onPress={() => router.push("/settings")} testID="menu-settings-button" />
            <SquareButton icon="mail" label={t("inbox", lang)} onPress={() => router.push("/inbox")} testID="menu-inbox-button" badge={unread > 0} />
          </View>
        </View>
      </View>
      {exitOpen ? (
        <ConfirmationDialog testID="exit-dialog" title="Exit Game?" message="Your progress is saved on this device." confirmLabel="Exit" destructive
          onConfirm={() => { setExitOpen(false); if (Platform.OS === "android") BackHandler.exitApp(); else showToast("Close the tab or app to exit.", "info"); }}
          onCancel={() => setExitOpen(false)} />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  shade: { backgroundColor: c.surface, opacity: 0.5 },
  content: { flex: 1, paddingHorizontal: spacing.md, justifyContent: "space-between" },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  player: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.hudPanel, borderRadius: radius.md, borderWidth: 2, borderColor: c.brandPrimary, padding: 6, paddingRight: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.onSurface },
  avatarText: { fontFamily: fonts.display, fontSize: 22, color: c.onBrandPrimary },
  playerName: { fontFamily: fonts.display, fontSize: 17, color: c.onSurface },
  lv: { fontFamily: fonts.bodyHeavy, fontSize: 11, color: c.gold },
  xpBg: { width: 72, height: 5, borderRadius: 3, backgroundColor: c.surface, overflow: "hidden", marginTop: 2 },
  xp: { height: "100%", backgroundColor: c.accent },
  wallet: { gap: 6, alignItems: "flex-end" },
  accountBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: c.hudPanel, borderWidth: 2, borderColor: c.brandPrimary },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.hudPanel, borderRadius: radius.pill, borderWidth: 2, borderColor: c.brandPrimary, height: 36, paddingHorizontal: spacing.sm, minWidth: 92 },
  coin: { width: 24, height: 24 },
  coins: { fontFamily: fonts.display, fontSize: 18, color: c.gold },
  gems: { fontFamily: fonts.display, fontSize: 18, color: c.gem },
  plus: { width: 22, height: 22, borderRadius: 11, backgroundColor: c.success, alignItems: "center", justifyContent: "center", marginLeft: "auto" },
  best: { fontFamily: fonts.bodyHeavy, fontSize: 13, color: c.onSurface, marginTop: 4 },
  bestValue: { fontFamily: fonts.display, color: c.gold, fontSize: 14 },
  stage: { flex: 1, flexDirection: "row", alignItems: "center" },
  col: { width: 76, gap: spacing.sm, alignItems: "center" },
  center: { flex: 1, alignItems: "center" },
  logo: { width: "100%", aspectRatio: 900 / 593 },
  square: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 2, borderColor: c.brandPrimary, alignItems: "center", justifyContent: "center", borderBottomWidth: 5, borderBottomColor: c.brandPrimaryDeep },
  squareLabel: { fontFamily: fonts.bodyHeavy, fontSize: 10.5, lineHeight: 13, letterSpacing: -0.3, color: c.onSurface, marginTop: 2, textAlign: "center", alignSelf: "stretch" },
  badge: { position: "absolute", top: -4, right: -4, width: 14, height: 14, borderRadius: 7, backgroundColor: c.error, borderWidth: 2, borderColor: c.onSurface },
  bottom: { gap: spacing.sm },
  bar: { flexDirection: "row", justifyContent: "center", gap: spacing.lg },
  saveErr: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", backgroundColor: c.error, borderRadius: radius.md, padding: spacing.sm },
  saveErrText: { fontFamily: fonts.bodyHeavy, color: c.onError },
}));

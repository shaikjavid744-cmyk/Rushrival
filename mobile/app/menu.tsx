import { Image } from "expo-image";
import { Redirect, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { BackHandler, Platform, ScrollView, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConfirmationDialog } from "@/src/components/ui/ConfirmationDialog";
import { CurrencyBalance } from "@/src/components/ui/CurrencyBalance";
import { PrimaryButton } from "@/src/components/ui/PrimaryButton";
import { ToggleTile } from "@/src/components/ui/ToggleTile";
import { UI_IMAGES } from "@/src/game/sprites";
import { useBackAction } from "@/src/hooks/useBackAction";
import { useGame } from "@/src/state/GameProvider";
import { fonts, makeStyles, radius, spacing } from "@/src/theme";

export default function MainMenu() {
  const s = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ready, save, updateSettings, devCorruptSave, showToast } = useGame();
  const { height: winH } = useWindowDimensions();
  const rushH = Math.max(110, Math.min(200, winH * 0.22));
  const [exitOpen, setExitOpen] = useState(false);

  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(withSequence(withTiming(-8, { duration: 700 }), withTiming(0, { duration: 700 })), -1);
  }, [bob]);
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));

  useBackAction(() => setExitOpen((o) => !o));

  if (!ready) return <Redirect href="/" />;

  const onDevCorrupt = __DEV__
    ? async () => {
        await devCorruptSave();
        showToast("DEV: save corrupted, relaunching...", "error");
        router.replace("/");
      }
    : undefined;

  return (
    <View style={s.root} testID="main-menu">
      <Image source={UI_IMAGES.bg} style={s.bg} contentFit="cover" />
      <View style={s.shade} />
      <ScrollView
        contentContainerStyle={[s.content, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.lg }]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.topBar}>
          <View style={s.player}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>P</Text>
            </View>
            <View>
              <Text style={s.playerName} testID="menu-player-name">
                Player
              </Text>
              <Text style={s.bestLine}>
                BEST <Text style={s.bestValue} testID="menu-best-score">{save.bestScore.toLocaleString()}</Text>
              </Text>
            </View>
          </View>
          <CurrencyBalance amount={save.coins} testID="menu-coin-balance" onLongPress={onDevCorrupt} delayLongPress={3000} />
        </View>

        <Animated.View entering={FadeInDown.duration(400)} style={s.hero}>
          <Image source={UI_IMAGES.logo} style={s.logo} contentFit="contain" accessibilityLabel="Rush Rivals" />
          <Animated.View style={[s.rushWrap, bobStyle]}>
            <Image source={UI_IMAGES.rush} style={[s.rush, { height: rushH, width: rushH * 0.6 }]} contentFit="contain" accessibilityLabel="Rush, the runner" />
          </Animated.View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).duration(400)} style={s.bottom}>
          <PrimaryButton label="Play" variant="gold" size="xl" icon="play" heavyHaptic onPress={() => router.replace("/run")} testID="play-button" />
          <View style={s.toggles}>
            <ToggleTile
              label="Sound"
              iconOn="volume-high"
              iconOff="volume-mute"
              value={save.settings.sound}
              onChange={(v) => updateSettings({ sound: v })}
              testID="toggle-sound"
            />
            <ToggleTile
              label="Vibration"
              iconOn="phone-portrait"
              iconOff="phone-portrait-outline"
              value={save.settings.vibration}
              onChange={(v) => updateSettings({ vibration: v })}
              testID="toggle-vibration"
            />
            <ToggleTile
              label="Touch buttons"
              iconOn="game-controller"
              iconOff="game-controller-outline"
              value={save.settings.accessibilityButtons}
              onChange={(v) => updateSettings({ accessibilityButtons: v })}
              testID="toggle-touch-buttons"
            />
          </View>
          <Text style={s.hint}>Swipe ← → to change lanes, ↑ to jump, ↓ to slide</Text>
        </Animated.View>
      </ScrollView>

      {exitOpen ? (
        <ConfirmationDialog
          testID="exit-dialog"
          title="Exit Game?"
          message="Your progress is saved on this device."
          confirmLabel="Exit"
          destructive
          onConfirm={() => {
            setExitOpen(false);
            if (Platform.OS === "android") BackHandler.exitApp();
            else showToast("Close the tab or app to exit.", "info");
          }}
          onCancel={() => setExitOpen(false)}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  bg: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  shade: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.surface, opacity: 0.45 },
  content: { flexGrow: 1, paddingHorizontal: spacing.lg, justifyContent: "space-between" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  player: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: c.hudPanel,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    paddingRight: spacing.lg,
    paddingLeft: 4,
    height: 52,
    flexShrink: 1,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: c.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: c.onSurface,
  },
  avatarText: { fontFamily: fonts.display, fontSize: 22, color: c.onBrandPrimary },
  playerName: { fontFamily: fonts.display, fontSize: 18, color: c.onSurface, lineHeight: 20 },
  bestLine: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: c.muted, letterSpacing: 1 },
  bestValue: { fontFamily: fonts.display, fontSize: 14, color: c.gold, letterSpacing: 0 },
  hero: { alignItems: "center", flexShrink: 1, marginVertical: spacing.sm },
  logo: { width: "92%", maxWidth: 380, aspectRatio: 900 / 593 },
  rushWrap: { marginTop: -spacing.lg },
  rush: { width: 120, height: 200 },
  bottom: { gap: spacing.md },
  toggles: { flexDirection: "row", gap: spacing.sm },
  hint: { fontFamily: fonts.body, fontSize: 12, color: c.onSurfaceSecondary, textAlign: "center" },
}));

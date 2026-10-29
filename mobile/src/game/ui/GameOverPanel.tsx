import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/src/components/ui/PrimaryButton";
import { SecondaryButton } from "@/src/components/ui/SecondaryButton";
import { UI_IMAGES } from "@/src/game/sprites";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export interface RunSummary {
  score: number;
  coins: number;
  distance: number;
  newBest: boolean;
}

interface Props extends RunSummary {
  onPlayAgain: () => void;
  onHome: () => void;
  /** Rewarded "Watch Ad +coins": doubles this run's coins once. */
  adCoins?: { state: "idle" | "loading" | "claimed"; testMode: boolean; onPress: () => void };
}

export function GameOverPanel({ score, coins, distance, newBest, onPlayAgain, onHome, adCoins }: Props) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (newBest) pulse.value = withRepeat(withSequence(withTiming(1.08, { duration: 420 }), withTiming(1, { duration: 420 })), -1);
  }, [newBest, pulse]);
  const badge = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }, { rotate: "-4deg" }] }));

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={[StyleSheet.absoluteFill, s.scrim, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}
      testID="game-over-panel"
    >
      <Animated.View entering={ZoomIn.springify().damping(15)} style={s.card}>
        <Text style={s.title} accessibilityRole="header">
          GAME OVER
        </Text>
        {newBest ? (
          <Animated.View style={[s.badge, badge]} testID="new-best-badge">
            <Ionicons name="trophy" size={20} color={colors.onGold} />
            <Text style={s.badgeText}>New Best!</Text>
          </Animated.View>
        ) : null}
        <Text style={s.caption}>SCORE</Text>
        <Text style={s.score} testID="game-over-score">
          {score.toLocaleString()}
        </Text>
        <View style={s.stats}>
          <View style={s.stat}>
            <Image source={UI_IMAGES.coin} style={s.coinImg} contentFit="contain" />
            <Text style={s.statValue} testID="game-over-coins">
              +{coins}
            </Text>
            <Text style={s.statLabel}>Coins earned</Text>
          </View>
          <View style={s.divider} />
          <View style={s.stat}>
            <Ionicons name="flag" size={26} color={colors.accent} />
            <Text style={s.statValue} testID="game-over-distance">
              {distance} m
            </Text>
            <Text style={s.statLabel}>Distance</Text>
          </View>
        </View>
        <View style={s.buttons}>
          {adCoins ? (
            adCoins.state === "claimed" ? (
              <Text style={[s.statLabel, { textAlign: "center" }]} testID="game-over-ad-coins-claimed">Reward already claimed</Text>
            ) : (
              <>
                <PrimaryButton
                  label={adCoins.state === "loading" ? "Loading ad…" : `Ad · +${coins} coins`}
                  icon="play-circle"
                  variant="navy"
                  disabled={adCoins.state !== "idle"}
                  onPress={adCoins.onPress}
                  testID="game-over-ad-coins-button"
                  accessibilityLabel={`Watch an ad for ${coins} more coins`}
                />
                {adCoins.testMode && adCoins.state === "idle" ? <Text style={[s.statLabel, { textAlign: "center" }]} testID="game-over-ad-test-mode">TEST MODE — no real ad</Text> : null}
              </>
            )
          ) : null}
          <PrimaryButton label="Play Again" variant="gold" size="lg" icon="play" heavyHaptic onPress={onPlayAgain} testID="play-again-button" />
          <SecondaryButton label="Home" icon="home" onPress={onHome} testID="game-over-home-button" />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  scrim: { backgroundColor: c.overlayScrim, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: c.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: c.borderStrong,
    padding: spacing.xl,
    alignItems: "center",
  },
  title: { fontFamily: fonts.display, fontSize: 40, color: c.onSurface, letterSpacing: 1 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.gold,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    marginTop: spacing.sm,
    borderBottomWidth: 4,
    borderColor: c.goldDeep,
  },
  badgeText: { fontFamily: fonts.display, fontSize: 20, color: c.onGold },
  caption: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: c.muted, letterSpacing: 2, marginTop: spacing.lg },
  score: { fontFamily: fonts.display, fontSize: 56, color: c.gold, lineHeight: 62 },
  stats: {
    flexDirection: "row",
    alignSelf: "stretch",
    backgroundColor: c.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  stat: { flex: 1, alignItems: "center" },
  divider: { width: 1, backgroundColor: c.divider },
  coinImg: { width: 28, height: 28 },
  statValue: { fontFamily: fonts.display, fontSize: 22, color: c.onSurface, marginTop: 2 },
  statLabel: { fontFamily: fonts.body, fontSize: 12, color: c.muted },
  buttons: { alignSelf: "stretch", gap: spacing.md, marginTop: spacing.xl },
}));

import Ionicons from "@react-native-vector-icons/ionicons";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/src/components/ui/PrimaryButton";
import { SecondaryButton } from "@/src/components/ui/SecondaryButton";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const SECONDS = 6;

interface Props {
  cost: number;
  gemsLeft: boolean;
  gems: number;
  score: number;
  onRevive: () => void;
  onDecline: () => void;
  /** Rewarded-ad revive (1 per run, separate from the gem revive). */
  ad?: { used: boolean; busy: boolean; testMode: boolean; onPress: () => void };
}

/** "Continue?" offer after a crash: pay gems (5 → 10, max 2) or watch a rewarded ad (max 1). */
export function RevivePanel({ cost, gemsLeft, gems, score, onRevive, onDecline, ad }: Props) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [left, setLeft] = useState(SECONDS);
  const paused = !!ad?.busy; // countdown holds while an ad is loading / showing
  useEffect(() => {
    if (paused) return;
    if (left <= 0) {
      onDecline();
      return;
    }
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [left, onDecline, paused]);
  const canPay = gemsLeft && gems >= cost;
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
  }, [t]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: 0.92 + 0.08 * t.value }] }));

  return (
    <Animated.View entering={FadeIn.duration(150)} style={[StyleSheet.absoluteFill, s.scrim, { paddingTop: insets.top, paddingBottom: insets.bottom }]} testID="revive-panel">
      <Animated.View style={[s.card, pop]}>
        <Text style={s.title}>CONTINUE?</Text>
        <View style={s.ring} testID="revive-countdown">
          <Text style={s.count}>{Math.max(0, left)}</Text>
        </View>
        <Text style={s.score}>Score {score.toLocaleString()}</Text>
        {gemsLeft ? (
          <PrimaryButton label={`Revive · ${cost}`} icon="diamond" variant="green" size="lg" disabled={!canPay} onPress={onRevive} testID="revive-gems-button" accessibilityLabel={`Revive for ${cost} gems`} />
        ) : (
          <Text style={s.need} testID="revive-gems-limit">Gem revives used for this run</Text>
        )}
        {gemsLeft && !canPay ? (
          <Text style={s.need} testID="revive-not-enough">
            Not enough gems ({gems}/{cost})
          </Text>
        ) : null}
        {ad ? (
          ad.used ? (
            <Text style={s.need} testID="revive-ad-limit">Revive limit reached</Text>
          ) : (
            <PrimaryButton label={ad.busy ? "Loading ad…" : "Ad Revive"} icon="play-circle" variant="navy" disabled={ad.busy} onPress={ad.onPress} testID="revive-ad-button" accessibilityLabel="Watch a rewarded ad to revive" />
          )
        ) : (
          <View style={s.ad} testID="revive-ad-disabled" accessibilityState={{ disabled: true }}>
            <Ionicons name="play-circle" size={20} color={colors.muted} />
            <Text style={s.adText}>No ad revive here</Text>
          </View>
        )}
        {ad?.testMode && !ad.used ? <Text style={s.adText} testID="revive-ad-test-mode">TEST MODE — no real ad</Text> : null}
        <SecondaryButton label="No thanks" onPress={onDecline} testID="revive-decline-button" />
      </Animated.View>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  scrim: { backgroundColor: c.overlayScrim, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  card: { width: "100%", maxWidth: 360, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 2, borderColor: c.borderStrong, padding: spacing.xl, gap: spacing.md, alignItems: "stretch" },
  title: { fontFamily: fonts.display, fontSize: 40, color: c.onSurface, textAlign: "center" },
  ring: { alignSelf: "center", width: 92, height: 92, borderRadius: 46, borderWidth: 6, borderColor: c.gold, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
  count: { fontFamily: fonts.display, fontSize: 44, color: c.gold },
  score: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: c.onSurfaceSecondary, textAlign: "center" },
  need: { fontFamily: fonts.bodyHeavy, fontSize: 13, color: c.warning, textAlign: "center" },
  ad: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, opacity: 0.6 },
  adText: { fontFamily: fonts.bodyHeavy, color: c.muted },
}));

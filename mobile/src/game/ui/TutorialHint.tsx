import Ionicons from "@react-native-vector-icons/ionicons";
import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { PrimaryButton } from "@/src/components/ui/PrimaryButton";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

import type { TutorialStep } from "../tutorial";

const DIR: Record<string, { dx: number; dy: number; arrow: React.ComponentProps<typeof Ionicons>["name"]; label: string }> = {
  left: { dx: -70, dy: 0, arrow: "arrow-back", label: "Swipe left" },
  right: { dx: 70, dy: 0, arrow: "arrow-forward", label: "Swipe right" },
  up: { dx: 0, dy: -70, arrow: "arrow-up", label: "Swipe up" },
  down: { dx: 0, dy: 70, arrow: "arrow-down", label: "Swipe down" },
};

/** Frozen-step hint: animated hand swiping in the required direction + instruction card. */
export function TutorialHint({ step }: { step: TutorialStep }) {
  const s = useStyles();
  const { colors } = useTheme();
  const d = DIR[step.action];
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, false);
  }, [t, step.id]);
  const hand = useAnimatedStyle(() => ({ transform: [{ translateX: d.dx * t.value }, { translateY: d.dy * t.value }], opacity: 1 - 0.6 * t.value }));
  return (
    <Animated.View entering={FadeIn.duration(150)} pointerEvents="none" style={[StyleSheet.absoluteFill, s.wrap]} testID="tutorial-hint" accessibilityLabel={`${d.label}. ${step.text}`}>
      <View style={s.card} testID={`tutorial-step-${step.id}`}>
        <Ionicons name={d.arrow} size={30} color={colors.gold} />
        <Text style={s.text}>{step.text}</Text>
      </View>
      <View style={s.handZone}>
        <Ionicons name={d.arrow} size={56} color={colors.gold} style={s.arrow} />
        <Animated.View style={hand}>
          <Ionicons name="hand-left" size={64} color={colors.onSurface} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

export function TutorialDonePanel({ onContinue }: { onContinue: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(200)} style={[StyleSheet.absoluteFill, s.scrim]} testID="tutorial-complete-panel">
      <View style={s.done}>
        <Ionicons name="trophy" size={56} color={colors.gold} style={{ alignSelf: "center" }} />
        <Text style={s.doneTitle}>Tutorial complete!</Text>
        <Text style={s.doneBody}>You know the moves. Time to rush!</Text>
        <PrimaryButton label="Continue" variant="gold" onPress={onContinue} testID="tutorial-continue-button" />
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { alignItems: "center", justifyContent: "center", backgroundColor: c.overlayScrim },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 2, borderColor: c.gold, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginHorizontal: spacing.lg, maxWidth: 380 },
  text: { flexShrink: 1, fontFamily: fonts.display, fontSize: 20, color: c.onSurface },
  handZone: { marginTop: spacing.xl, width: 200, height: 160, alignItems: "center", justifyContent: "center" },
  arrow: { position: "absolute", opacity: 0.5 },
  scrim: { backgroundColor: c.overlayScrim, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  done: { width: "100%", maxWidth: 360, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 2, borderColor: c.gold, padding: spacing.xl, gap: spacing.md },
  doneTitle: { fontFamily: fonts.display, fontSize: 30, color: c.onSurface, textAlign: "center" },
  doneBody: { fontFamily: fonts.body, fontSize: 15, color: c.onSurfaceSecondary, textAlign: "center" },
}));

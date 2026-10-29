import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { fonts, makeStyles, radius, spacing } from "@/src/theme";

import { PrimaryButton } from "./PrimaryButton";
import { SecondaryButton } from "./SecondaryButton";

interface Props {
  onResume: () => void;
  onRestart: () => void;
  onHome: () => void;
}

/** Opaque full-width modal over a dimmed backdrop. Card starts at 94% scale so it is never tiny mid-animation. */
export function PauseMenu({ onResume, onRestart, onHome }: Props) {
  const s = useStyles();
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) });
  }, [t]);
  const cardAnim = useAnimatedStyle(() => ({ transform: [{ scale: 0.94 + 0.06 * t.value }] }));

  return (
    <View style={[StyleSheet.absoluteFill, s.scrim]} testID="pause-menu" accessibilityViewIsModal>
      <Animated.View style={[s.card, cardAnim]} testID="pause-menu-card">
        <Text style={s.title} accessibilityRole="header">
          GAME PAUSED
        </Text>
        <View style={s.buttons}>
          <PrimaryButton label="Resume" icon="play" onPress={onResume} testID="pause-resume-button" />
          <SecondaryButton label="Restart" icon="refresh" onPress={onRestart} testID="pause-restart-button" />
          <SecondaryButton label="Home" icon="home" onPress={onHome} testID="pause-home-button" />
        </View>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  scrim: { backgroundColor: c.overlayScrim, alignItems: "center", justifyContent: "center" },
  card: {
    width: "85%",
    maxWidth: 420,
    backgroundColor: c.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: c.borderStrong,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  title: { fontFamily: fonts.display, fontSize: 36, color: c.onSurface, textAlign: "center", letterSpacing: 1 },
  buttons: { gap: spacing.md, marginTop: spacing.lg },
}));

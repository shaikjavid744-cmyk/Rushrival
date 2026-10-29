import React, { useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { audio } from "@/src/services/audio";
import { haptics } from "@/src/services/haptics";
import { fonts, makeStyles } from "@/src/theme";

export interface CountStep {
  label: string;
  ms: number;
}

export const START_STEPS: CountStep[] = [
  { label: "3", ms: 700 },
  { label: "2", ms: 700 },
  { label: "1", ms: 700 },
  { label: "GO!", ms: 450 },
];
export const RESUME_STEPS: CountStep[] = [
  { label: "3", ms: 1000 },
  { label: "2", ms: 1000 },
  { label: "1", ms: 1000 },
];

export function CountdownOverlay({ steps, onDone }: { steps: CountStep[]; onDone: () => void }) {
  const s = useStyles();
  const [i, setI] = useState(0);
  const scale = useSharedValue(1.8);
  const opacity = useSharedValue(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const step = steps[i];
    if (!step) return;
    scale.value = 1.8;
    opacity.value = 0;
    scale.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.back(2)) });
    opacity.value = withTiming(1, { duration: 140 });
    const isGo = step.label === "GO!";
    audio.play(isGo ? "go" : "tick");
    if (isGo) haptics.heavy();
    else haptics.light();
    const t = setTimeout(() => {
      if (i + 1 >= steps.length) doneRef.current();
      else setI(i + 1);
    }, step.ms);
    return () => clearTimeout(t);
  }, [i, steps, scale, opacity]);

  const anim = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  const label = steps[i]?.label ?? "";

  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.wrap]} pointerEvents="none" testID="countdown-overlay">
      <Animated.Text style={[s.text, label === "GO!" && s.go, anim]} testID="countdown-text">
        {label}
      </Animated.Text>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { alignItems: "center", justifyContent: "center", backgroundColor: "transparent" },
  text: {
    fontFamily: fonts.display,
    fontSize: 120,
    color: c.onSurface,
    textShadowColor: c.brandPrimaryDeep,
    textShadowOffset: { width: 0, height: 6 },
    textShadowRadius: 0,
  },
  go: { color: c.gold, textShadowColor: c.goldDeep },
}));

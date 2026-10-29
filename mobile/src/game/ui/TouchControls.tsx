import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/src/components/ui/IconButton";
import type { Action } from "@/src/game/player";
import { makeStyles, spacing } from "@/src/theme";

/** Optional on-screen accessibility controls (toggle on Main Menu). Fires on press-in for latency. */
export function TouchControls({ onAction }: { onAction: (a: Action) => void }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.row, { bottom: insets.bottom + spacing.lg }]} pointerEvents="box-none" testID="touch-controls">
      <IconButton icon="arrow-back" variant="blue" size={60} onPressIn={() => onAction("left")} testID="a11y-left-button" accessibilityLabel="Move left" />
      <IconButton icon="arrow-up" variant="green" size={60} onPressIn={() => onAction("up")} testID="a11y-jump-button" accessibilityLabel="Jump" />
      <IconButton icon="arrow-down" variant="gold" size={60} onPressIn={() => onAction("down")} testID="a11y-slide-button" accessibilityLabel="Slide" />
      <IconButton icon="arrow-forward" variant="blue" size={60} onPressIn={() => onAction("right")} testID="a11y-right-button" accessibilityLabel="Move right" />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
  },
}));

import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import React from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { UI_IMAGES } from "@/src/game/sprites";
import { IconButton } from "@/src/components/ui/IconButton";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

interface Props {
  score: number;
  coins: number;
  distance: number;
  fps: number | null;
  onPause: () => void;
  pauseEnabled: boolean;
}

export function Hud({ score, coins, distance, fps, onPause, pauseEnabled }: Props) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.wrap, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none" testID="run-hud">
      <View pointerEvents="none">
      <View style={s.panel}>
        <Text style={s.caption}>SCORE</Text>
        <Text style={s.score} testID="hud-score" accessibilityLabel={`Score ${score}`}>
          {score.toLocaleString()}
        </Text>
        <View style={s.row}>
          <Ionicons name="speedometer" size={12} color={colors.muted} />
          <Text style={s.distance} testID="hud-distance">
            {distance} m
          </Text>
        </View>
      </View>
      {fps !== null ? (
        <Text style={s.fps} testID="fps-counter">
          FPS {fps}
        </Text>
      ) : null}
      </View>
      <View style={s.right} pointerEvents="box-none">
        <View style={s.coinPill}>
          <Image source={UI_IMAGES.coin} style={s.coinImg} contentFit="contain" />
          <Text style={s.coins} testID="hud-coins" accessibilityLabel={`Coins ${coins}`}>
            {coins}
          </Text>
        </View>
        <IconButton
          icon="pause"
          variant="blue"
          onPress={pauseEnabled ? onPause : undefined}
          testID="hud-pause-button"
          accessibilityLabel="Pause"
          size={48}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: spacing.md,
  },
  panel: {
    backgroundColor: c.hudPanel,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 120,
  },
  caption: { fontFamily: fonts.bodyHeavy, fontSize: 11, color: c.muted, letterSpacing: 1.5 },
  score: { fontFamily: fonts.display, fontSize: 30, color: c.onSurface, lineHeight: 34 },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  distance: { fontFamily: fonts.bodyHeavy, fontSize: 13, color: c.onSurfaceSecondary },
  right: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  coinPill: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    backgroundColor: c.hudPanel,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    paddingLeft: 6,
    paddingRight: spacing.md,
  },
  coinImg: { width: 32, height: 32, marginRight: 6 },
  coins: { fontFamily: fonts.display, fontSize: 24, color: c.gold, minWidth: 24 },
  fps: {
    marginTop: 4,
    marginLeft: spacing.xs,
    fontFamily: fonts.bodyHeavy,
    fontSize: 11,
    color: c.success,
  },
}));

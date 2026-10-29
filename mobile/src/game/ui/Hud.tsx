import { Image } from "expo-image";
import React from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/src/components/ui/IconButton";
import { POWERUP_IMAGES, type CatalogItem } from "@/src/config/catalog";
import { TUNING } from "@/src/game/constants";
import { UI_IMAGES } from "@/src/game/sprites";
import type { PowerUpKind } from "@/src/game/types";
import { fonts, makeStyles, radius, spacing } from "@/src/theme";

interface Props {
  score: number;
  coins: number;
  distance: number;
  fps: number | null;
  onPause: () => void;
  pauseEnabled: boolean;
  timers?: Record<string, number>;
  multiplier?: number;
  hoverboards?: number;
}

const KINDS: PowerUpKind[] = ["magnet", "shield", "speed", "x2", "hoverboard"];

/** Storyboard HUD: pause square top-left, score panel (+x2 chip) and coins top-right, power-up timers left column. */
export function Hud({ score, coins, distance, fps, onPause, pauseEnabled, timers = {}, multiplier = 1, hoverboards = 0 }: Props) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const active = KINDS.filter((k) => (timers[k] ?? 0) > 0);
  return (
    <View style={[s.wrap, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none" testID="run-hud">
      <View pointerEvents="box-none">
        <IconButton icon="pause" variant="blue" onPress={pauseEnabled ? onPause : undefined} testID="hud-pause-button" accessibilityLabel="Pause" size={52} />
        <View style={s.timers} pointerEvents="none">
          {active.map((k) => (
            <View key={k} style={s.timer} testID={`hud-powerup-${k}`}>
              <Image source={POWERUP_IMAGES[k] as CatalogItem["image"]} style={s.puImg} contentFit="contain" />
              <View style={s.barBg}>
                <View style={[s.bar, { width: `${Math.round(((timers[k] ?? 0) / TUNING.durations[k]) * 100)}%` }]} />
              </View>
            </View>
          ))}
        </View>
      </View>
      <View style={s.right} pointerEvents="none">
        <View style={s.panel}>
          <View style={s.row}>
            <Text style={s.score} testID="hud-score" accessibilityLabel={`Score ${score}`}>
              {score.toLocaleString()}
            </Text>
            {multiplier > 1 ? (
              <View style={s.chip} testID="hud-x2">
                <Text style={s.chipText}>x{multiplier}</Text>
              </View>
            ) : null}
          </View>
          <Text style={s.distance} testID="hud-distance">
            {distance} m
          </Text>
        </View>
        <View style={s.coinPill}>
          <Image source={UI_IMAGES.coin} style={s.coinImg} contentFit="contain" />
          <Text style={s.coins} testID="hud-coins" accessibilityLabel={`Coins ${coins}`}>
            {coins}
          </Text>
        </View>
        {hoverboards > 0 ? (
          <View style={s.hintPill}>
            <Text style={s.hint} testID="hud-hoverboards">
              Double-tap: board ×{hoverboards}
            </Text>
          </View>
        ) : null}
        {fps !== null ? (
          <Text style={s.fps} testID="fps-counter">
            FPS {fps}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: spacing.md },
  timers: { marginTop: spacing.md, gap: spacing.sm },
  timer: { flexDirection: "row", alignItems: "center", backgroundColor: c.hudPanel, borderRadius: radius.pill, borderWidth: 1, borderColor: c.brandPrimary, padding: 4, paddingRight: spacing.sm, gap: 6 },
  puImg: { width: 30, height: 30 },
  barBg: { width: 56, height: 8, borderRadius: 4, backgroundColor: c.surface, overflow: "hidden" },
  bar: { height: "100%", backgroundColor: c.success },
  fps: { fontFamily: fonts.bodyHeavy, fontSize: 11, color: c.success },
  hintPill: { backgroundColor: c.hudPanel, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3, borderWidth: 1, borderColor: c.brandPrimary },
  right: { alignItems: "flex-end", gap: spacing.sm },
  panel: { backgroundColor: c.hudPanel, borderRadius: radius.md, borderWidth: 2, borderColor: c.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: 4, minWidth: 130, alignItems: "flex-end" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  score: { fontFamily: fonts.display, fontSize: 30, color: c.onSurface, lineHeight: 34, textShadowColor: c.brandPrimaryDeep, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  chip: { backgroundColor: c.gold, borderRadius: radius.sm, paddingHorizontal: 6, borderBottomWidth: 3, borderColor: c.goldDeep },
  chipText: { fontFamily: fonts.display, fontSize: 16, color: c.onGold },
  distance: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: c.onSurfaceSecondary },
  coinPill: { flexDirection: "row", alignItems: "center", height: 40, backgroundColor: c.hudPanel, borderRadius: radius.pill, borderWidth: 2, borderColor: c.gold, paddingLeft: 4, paddingRight: spacing.md },
  coinImg: { width: 30, height: 30, marginRight: 6 },
  coins: { fontFamily: fonts.display, fontSize: 22, color: c.gold, minWidth: 24, textAlign: "right" },
  hint: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: c.onSurface },
}));

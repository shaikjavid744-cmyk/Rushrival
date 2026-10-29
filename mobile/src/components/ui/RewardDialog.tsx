import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { UI_IMAGES } from "@/src/game/sprites";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

import { PrimaryButton } from "./PrimaryButton";

interface Props {
  title: string;
  reward: { currency: "coins" | "gems" | "hoverboards"; amount: number };
  onClose: () => void;
  testID: string;
}

/** Celebratory "you got X" dialog used by missions, inbox and shop. */
export function RewardDialog({ title, reward, onClose, testID }: Props) {
  const s = useStyles();
  const { colors } = useTheme();
  // Explicit scale animation (layout ZoomIn can stall mid-way on web, leaving a tiny card).
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
  }, [t]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: 0.92 + 0.08 * t.value }] }));
  return (
    <Animated.View entering={FadeIn.duration(150)} style={[StyleSheet.absoluteFill, s.scrim]} testID={testID}>
      <Animated.View style={[s.card, pop]}>
        <Text style={s.title}>{title}</Text>
        <View style={s.icon}>
          {reward.currency === "coins" ? (
            <Image source={UI_IMAGES.coin} style={{ width: 64, height: 64 }} />
          ) : (
            <Ionicons name={reward.currency === "gems" ? "diamond" : "albums"} size={60} color={reward.currency === "gems" ? colors.gem : colors.accent} />
          )}
        </View>
        <Text style={s.amount} testID={`${testID}-amount`}>
          +{reward.amount.toLocaleString()} {reward.currency}
        </Text>
        <PrimaryButton label="Awesome!" variant="gold" onPress={onClose} testID={`${testID}-close`} />
      </Animated.View>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  scrim: { backgroundColor: c.overlayScrim, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  card: { width: "100%", maxWidth: 340, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 2, borderColor: c.gold, padding: spacing.xl, gap: spacing.md, alignItems: "stretch" },
  title: { fontFamily: fonts.display, fontSize: 26, color: c.onSurface, textAlign: "center" },
  icon: { alignItems: "center" },
  amount: { fontFamily: fonts.display, fontSize: 28, color: c.gold, textAlign: "center" },
}));

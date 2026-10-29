import Ionicons from "@react-native-vector-icons/ionicons";
import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

import { haptics } from "@/src/services/haptics";
import { fonts, radius, ThemeColors, useTheme } from "@/src/theme";

export type ButtonVariant = "blue" | "gold" | "green" | "red" | "navy";
export type ButtonSize = "md" | "lg" | "xl";

export function variantColors(c: ThemeColors, v: ButtonVariant) {
  switch (v) {
    case "gold":
      return { face: c.gold, lip: c.goldDeep, text: c.onGold };
    case "green":
      return { face: c.success, lip: c.successDeep, text: c.onSuccess };
    case "red":
      return { face: c.error, lip: c.errorDeep, text: c.onError };
    case "navy":
      return { face: c.surfaceTertiary, lip: c.surfaceTertiaryDeep, text: c.onSurfaceTertiary };
    default:
      return { face: c.brandPrimary, lip: c.brandPrimaryDeep, text: c.onBrandPrimary };
  }
}

const SIZES: Record<ButtonSize, { h: number; font: number; lip: number; icon: number }> = {
  md: { h: 52, font: 20, lip: 5, icon: 20 },
  lg: { h: 60, font: 24, lip: 6, icon: 24 },
  xl: { h: 76, font: 38, lip: 8, icon: 34 },
};

export interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  testID: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  style?: ViewStyle;
  heavyHaptic?: boolean;
}

/** Chunky 3D "lip" button. Face sinks into the lip on press. */
export function PrimaryButton({
  label,
  onPress,
  variant = "blue",
  size = "lg",
  icon,
  testID,
  accessibilityLabel,
  disabled,
  style,
  heavyHaptic,
}: PrimaryButtonProps) {
  const { colors } = useTheme();
  const vc = variantColors(colors, variant);
  const sz = SIZES[size];
  const pressed = useSharedValue(0);

  const outer = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(pressed.value ? 0.96 : 1, { damping: 15, stiffness: 400 }) }] }));
  const face = useAnimatedStyle(() => ({ transform: [{ translateY: withTiming(pressed.value * (sz.lip - 1), { duration: 70 }) }] }));

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={() => (pressed.value = 1)}
      onPressOut={() => (pressed.value = 0)}
      onPress={() => {
        if (heavyHaptic) haptics.heavy();
        else haptics.medium();
        onPress();
      }}
      style={[{ opacity: disabled ? 0.5 : 1 }, style]}
    >
      <Animated.View style={[styles.lip, { height: sz.h + sz.lip, backgroundColor: vc.lip, borderRadius: radius.md }, outer]}>
        <Animated.View style={[styles.face, { height: sz.h, backgroundColor: vc.face, borderRadius: radius.md }, face]}>
          <View style={[styles.shine, { backgroundColor: colors.onSurface }]} />
          {icon ? <Ionicons name={icon} size={sz.icon} color={vc.text} style={styles.icon} /> : null}
          <Text style={[styles.label, { color: vc.text, fontSize: sz.font }]} numberOfLines={1}>
            {label}
          </Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lip: { width: "100%" },
  face: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  shine: { position: "absolute", top: 4, left: 10, right: 10, height: 6, borderRadius: 3, opacity: 0.18 },
  icon: { marginRight: 8 },
  label: { fontFamily: fonts.display, letterSpacing: 1, textTransform: "uppercase" },
});

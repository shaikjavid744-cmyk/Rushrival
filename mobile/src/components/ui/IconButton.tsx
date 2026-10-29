import Ionicons from "@react-native-vector-icons/ionicons";
import React from "react";
import { Pressable, StyleSheet, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { haptics } from "@/src/services/haptics";
import { radius, useTheme } from "@/src/theme";

import { ButtonVariant, variantColors } from "./PrimaryButton";

interface Props {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress?: () => void;
  onPressIn?: () => void;
  testID: string;
  accessibilityLabel: string;
  variant?: ButtonVariant;
  size?: number;
  style?: ViewStyle;
  accessibilityRole?: "button" | "switch";
  checked?: boolean;
}

export function IconButton({
  icon,
  onPress,
  onPressIn,
  testID,
  accessibilityLabel,
  variant = "navy",
  size = 52,
  style,
  accessibilityRole = "button",
  checked,
}: Props) {
  const { colors } = useTheme();
  const vc = variantColors(colors, variant);
  const lip = 4;
  const pressed = useSharedValue(0);
  const face = useAnimatedStyle(() => ({ transform: [{ translateY: withTiming(pressed.value * (lip - 1), { duration: 60 }) }] }));

  return (
    <Pressable
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={checked === undefined ? undefined : { checked }}
      hitSlop={6}
      onPressIn={() => {
        pressed.value = 1;
        onPressIn?.();
      }}
      onPressOut={() => (pressed.value = 0)}
      onPress={() => {
        if (onPress) {
          haptics.selection();
          onPress();
        }
      }}
      style={style}
    >
      <Animated.View style={{ width: size, height: size + lip, borderRadius: radius.md, backgroundColor: vc.lip }}>
        <Animated.View style={[styles.face, { width: size, height: size, borderRadius: radius.md, backgroundColor: vc.face }, face]}>
          <Ionicons name={icon} size={size * 0.5} color={vc.text} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  face: { alignItems: "center", justifyContent: "center" },
});

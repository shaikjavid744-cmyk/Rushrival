import Ionicons from "@react-native-vector-icons/ionicons";
import React, { useEffect } from "react";
import { Text } from "react-native";
import Animated, { SlideInUp, SlideOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export type ToastVariant = "info" | "success" | "error" | "warning";

interface Props {
  message: string;
  variant?: ToastVariant;
  duration?: number;
  onHide: () => void;
}

export function ToastMessage({ message, variant = "info", duration = 3500, onHide }: Props) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    const t = setTimeout(onHide, duration);
    return () => clearTimeout(t);
  }, [duration, onHide]);

  const accent = variant === "error" ? colors.error : variant === "success" ? colors.success : variant === "warning" ? colors.warning : colors.brandPrimary;
  const icon = variant === "error" ? "alert-circle" : variant === "success" ? "checkmark-circle" : variant === "warning" ? "warning" : "information-circle";

  return (
    <Animated.View
      entering={SlideInUp.springify().damping(18)}
      exiting={SlideOutUp}
      style={[s.toast, { top: insets.top + 72, borderColor: accent }]}
      testID="toast-message"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      pointerEvents="none"
    >
      <Ionicons name={icon} size={22} color={accent} />
      <Text style={s.text} testID="toast-message-text">
        {message}
      </Text>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  toast: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: c.shadow,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  text: { flex: 1, fontFamily: fonts.bodyHeavy, fontSize: 15, color: c.onSurface },
}));

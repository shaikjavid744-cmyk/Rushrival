import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { fonts, makeStyles, radius, spacing } from "@/src/theme";

import { PrimaryButton } from "./PrimaryButton";
import { SecondaryButton } from "./SecondaryButton";

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testID: string;
}

/** In-tree modal dialog (renders above everything placed before it). */
export function ConfirmationDialog({ title, message, confirmLabel, cancelLabel = "Cancel", destructive, onConfirm, onCancel, testID }: Props) {
  const s = useStyles();
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) });
  }, [t]);
  const cardAnim = useAnimatedStyle(() => ({ transform: [{ scale: 0.94 + 0.06 * t.value }] }));
  return (
    <View style={[StyleSheet.absoluteFill, s.scrim]} testID={testID}>
      <Animated.View style={[s.card, cardAnim]} accessibilityViewIsModal>
        <Text style={s.title} testID={`${testID}-title`}>
          {title}
        </Text>
        <Text style={s.message}>{message}</Text>
        <View style={s.buttons}>
          <PrimaryButton
            label={confirmLabel}
            variant={destructive ? "red" : "blue"}
            size="md"
            onPress={onConfirm}
            testID={`${testID}-confirm`}
          />
          <SecondaryButton label={cancelLabel} size="md" onPress={onCancel} testID={`${testID}-cancel`} />
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
    padding: spacing.xl,
  },
  title: { fontFamily: fonts.display, fontSize: 30, color: c.onSurface, textAlign: "center" },
  message: { fontFamily: fonts.body, fontSize: 16, color: c.onSurfaceSecondary, textAlign: "center", marginTop: spacing.sm },
  buttons: { marginTop: spacing.xl, gap: spacing.md },
}));

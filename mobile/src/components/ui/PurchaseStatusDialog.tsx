import Ionicons from "@react-native-vector-icons/ionicons";
import React from "react";
import { StyleSheet, Text } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

import { PrimaryButton } from "./PrimaryButton";

/** Real-money purchase result. Phase 2: always "Store not available yet" (BillingService stub). */
export function PurchaseStatusDialog({ status, onClose, testID }: { status: "unavailable" | "success" | "error"; onClose: () => void; testID: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const map = {
    unavailable: { icon: "storefront" as const, title: "Store not available yet", body: "Real-money purchases are coming in a future update. Nothing was charged.", color: colors.accent },
    success: { icon: "checkmark-circle" as const, title: "Purchase complete", body: "Your items were added.", color: colors.success },
    error: { icon: "alert-circle" as const, title: "Purchase failed", body: "Nothing was charged. Please try again.", color: colors.error },
  }[status];
  return (
    <Animated.View entering={FadeIn.duration(150)} style={[StyleSheet.absoluteFill, s.scrim]} testID={testID}>
      <Animated.View style={s.card}>
        <Ionicons name={map.icon} size={56} color={map.color} style={{ alignSelf: "center" }} />
        <Text style={s.title} testID={`${testID}-title`}>{map.title}</Text>
        <Text style={s.body}>{map.body}</Text>
        <PrimaryButton label="OK" onPress={onClose} testID={`${testID}-ok`} />
      </Animated.View>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  scrim: { backgroundColor: c.overlayScrim, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  card: { width: "100%", maxWidth: 340, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 2, borderColor: c.brandPrimary, padding: spacing.xl, gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: c.onSurface, textAlign: "center" },
  body: { fontFamily: fonts.body, fontSize: 15, color: c.onSurfaceSecondary, textAlign: "center" },
}));

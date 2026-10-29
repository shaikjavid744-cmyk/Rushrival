import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useGame } from "@/src/state/GameProvider";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

import { IconButton } from "./IconButton";

/** Sticky header with back button, title and coin + gem balances. */
export function ScreenHeader({ title, testID }: { title: string; testID: string }) {
  const s = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { save } = useGame();
  return (
    <View style={[s.bar, { paddingTop: insets.top + spacing.sm }]} testID={testID}>
      <IconButton icon="arrow-back" size={44} onPress={() => (router.canGoBack() ? router.back() : router.replace("/menu"))} testID={`${testID}-back`} accessibilityLabel="Back" />
      <Text style={s.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={s.pill}>
        <Ionicons name="ellipse" size={14} color={colors.gold} />
        <Text style={s.coins} testID={`${testID}-coins`}>{save.coins.toLocaleString()}</Text>
        <Ionicons name="diamond" size={14} color={colors.gem} />
        <Text style={s.gems} testID={`${testID}-gems`}>{save.gems.toLocaleString()}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  bar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: c.surface, borderBottomWidth: 1, borderColor: c.border },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 24, color: c.onSurface },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.surfaceSecondary, borderRadius: radius.pill, borderWidth: 1, borderColor: c.brandPrimary, paddingHorizontal: spacing.sm, height: 32 },
  coins: { fontFamily: fonts.display, fontSize: 14, color: c.gold, marginRight: 6 },
  gems: { fontFamily: fonts.display, fontSize: 14, color: c.gem },
}));

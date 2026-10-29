import NetInfo from "@react-native-community/netinfo";
import Ionicons from "@react-native-vector-icons/ionicons";
import { usePathname } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform, Text } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

/** Small top banner when the device is offline. Gameplay is fully offline, so this is informational. */
export function NetworkStatus() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [offline, setOffline] = useState(() => Platform.OS === "web" && typeof navigator !== "undefined" && navigator.onLine === false);
  const [dismissed, setDismissed] = useState(false);
  const path = usePathname();
  useEffect(() => {
    const apply = (off: boolean) => {
      setOffline(off);
      if (!off) setDismissed(false);
    };
    if (Platform.OS === "web" && typeof window !== "undefined") {
      // Web: NetInfo is unreliable here; navigator.onLine + online/offline events are authoritative.
      const on = () => apply(false);
      const off = () => apply(true);
      window.addEventListener("online", on);
      window.addEventListener("offline", off);
      apply(navigator.onLine === false);
      return () => {
        window.removeEventListener("online", on);
        window.removeEventListener("offline", off);
      };
    }
    return NetInfo.addEventListener((st) => apply(st.isConnected === false));
  }, []);
  if (!offline || dismissed || path === "/run" || path === "/tutorial") return null; // keep the run HUD clear
  return (
    <Animated.View entering={FadeInUp} exiting={FadeOutUp} style={[s.bar, { top: insets.top + spacing.xs }]} testID="network-status-offline">
      <Ionicons name="cloud-offline" size={16} color={colors.onSurface} />
      <Text style={s.text} onPress={() => setDismissed(true)} accessibilityRole="button" accessibilityLabel="Offline. Tap to dismiss">
        Offline — you can keep playing. Tap to hide
      </Text>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  bar: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.surfaceTertiary, borderRadius: radius.pill, borderWidth: 1, borderColor: c.warning, paddingHorizontal: spacing.md, height: 32 },
  text: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: c.onSurface },
}));

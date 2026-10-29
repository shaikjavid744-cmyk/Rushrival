import { usePathname, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { useGame } from "@/src/state/GameProvider";
import { colors } from "@/src/theme";

/**
 * Until the save has loaded, only the splash route ("/") may be used. A reload / deep link to any
 * other screen is covered and sent through the splash (writes are also blocked in GameProvider.commit).
 */
export function BootGate() {
  const { ready } = useGame();
  const path = usePathname();
  const router = useRouter();
  const blocked = !ready && path !== "/" && path !== "/dev-rig";
  useEffect(() => {
    if (blocked) router.replace({ pathname: "/", params: { next: path } });
  }, [blocked, router]);
  if (!blocked) return null;
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} testID="boot-gate" />;
}

import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { LogBox, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { NetworkStatus } from "@/src/components/ui/NetworkStatus";
import { BootGate } from "@/src/state/BootGate";
import { AccountProvider } from "@/src/online/AccountProvider";
import { RemoteConfigGate } from "@/src/online/RemoteConfigGate";
import { MonetizationHost } from "@/src/monetization/MonetizationHost";
import { GameProvider } from "@/src/state/GameProvider";
import { colors } from "@/src/theme";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  // Fonts + icon font are pre-warmed before first render so icons never appear blank (Expo Go Android).
  const [loaded, error] = useFonts({
    LilitaOne: require("../assets/fonts/LilitaOne-Regular.ttf"),
    "Nunito-Bold": require("../assets/fonts/Nunito-Bold.ttf"),
    "Nunito-ExtraBold": require("../assets/fonts/Nunito-ExtraBold.ttf"),
    Ionicons: require("@react-native-vector-icons/ionicons/fonts/Ionicons.ttf"),
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded, error]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />
      <ErrorBoundary>
        {loaded || error ? (
          <GameProvider>
            <AccountProvider>
              <Stack screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: colors.surface } }} />
              <BootGate />
              <NetworkStatus />
              <RemoteConfigGate />
              <MonetizationHost />
            </AccountProvider>
          </GameProvider>
        ) : (
          <View style={styles.root} />
        )}
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
});

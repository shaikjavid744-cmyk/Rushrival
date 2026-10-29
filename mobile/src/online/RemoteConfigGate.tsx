import Ionicons from "@react-native-vector-icons/ionicons";
import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/src/components/ui/PrimaryButton";
import { useTheme } from "@/src/theme";

import { APP_VERSION, cmpVersion, useAccount } from "./AccountProvider";
import { useOnlineStyles } from "./styles";

/** Maintenance / Update required block the app; Update available is a dismissible banner; sync status pill. */
export function RemoteConfigGate() {
  const { config, reloadConfig, syncStatus, retrySync, signedIn } = useAccount();
  const s = useOnlineStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = React.useState(false);
  const [playOffline, setPlayOffline] = React.useState(false);
  const store = () => config.store_url && Linking.openURL(config.store_url).catch(() => undefined);

  if ((config.maintenance && !playOffline) || cmpVersion(APP_VERSION, config.min_supported_version) < 0) {
    const maint = config.maintenance;
    return (
      <View style={[s.root, s.center, { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }]} testID={maint ? "maintenance-screen" : "update-required-screen"}>
        <Ionicons name={maint ? "construct" : "cloud-download"} size={64} color={colors.gold} />
        <Text style={s.title}>{maint ? "We'll be right back" : "Update required"}</Text>
        <Text style={[s.muted, { textAlign: "center" }]}>{maint ? "Rush Rivals is under maintenance. Please try again soon." : `This version (${APP_VERSION}) is no longer supported. Update to keep playing.`}</Text>
        {maint ? (
          <>
            <PrimaryButton label="Play offline" variant="gold" onPress={() => setPlayOffline(true)} testID="maintenance-play-offline" />
            <PrimaryButton label="Retry" variant="navy" onPress={reloadConfig} testID="maintenance-retry" />
          </>
        ) : (
          <PrimaryButton label="Update now" variant="gold" onPress={store} testID="update-required-button" />
        )}
      </View>
    );
  }
  return (
    <>
      {!dismissed && cmpVersion(APP_VERSION, config.latest_version) < 0 ? (
        <View style={[s.card, s.row, { position: "absolute", left: 12, right: 12, bottom: insets.bottom + 12 }]} testID="update-available-banner">
          <Ionicons name="sparkles" size={20} color={colors.gold} />
          <Text style={[s.text, { flex: 1 }]}>Update available</Text>
          <Pressable onPress={store} testID="update-available-open" accessibilityRole="button" hitSlop={8}><Text style={s.link}>Update now</Text></Pressable>
          <Pressable onPress={() => setDismissed(true)} testID="update-available-dismiss" accessibilityRole="button" hitSlop={8}><Text style={[s.link, { color: colors.muted }]}>Later</Text></Pressable>
        </View>
      ) : null}
      {signedIn && syncStatus === "failed" ? (
        <Pressable onPress={retrySync} style={[s.card, s.row, { position: "absolute", alignSelf: "center", top: insets.top + 56, paddingVertical: 8 }]} testID="sync-failed-banner" accessibilityRole="button" accessibilityLabel="Cloud sync failed. Retry">
          <Ionicons name="cloud-offline" size={18} color={colors.error} />
          <Text style={s.error}>Cloud sync failed</Text>
          <Text style={s.link}>Retry</Text>
        </Pressable>
      ) : null}
    </>
  );
}

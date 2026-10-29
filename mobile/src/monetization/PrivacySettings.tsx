import React, { useSyncExternalStore } from "react";
import { Pressable, Text, View } from "react-native";

import { ToggleTile } from "@/src/components/ui/ToggleTile";
import { monStore } from "@/src/monetization/store";
import { ads } from "@/src/services/ads";
import { analytics } from "@/src/services/analytics";
import { useGame } from "@/src/state/GameProvider";
import { fonts, makeStyles, radius, spacing } from "@/src/theme";

/** Settings → Privacy & ad choices (UMP), analytics consent, Remove Ads status. */
export function PrivacySettings() {
  const s = useStyles();
  const { save } = useGame();
  const mon = useSyncExternalStore(monStore.subscribe, monStore.get);
  const child = save.onboarding.childMode;
  const removeAds = mon.entitlements.includes("remove_ads");
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={s.h}>Privacy & Ads</Text>
      <View style={s.row}>
        <ToggleTile
          label={child ? "Analytics (off in child mode)" : "Usage analytics"}
          iconOn="analytics"
          iconOff="analytics-outline"
          value={mon.analytics && !child}
          onChange={(v) => {
            void monStore.set({ analytics: v });
            analytics.setConsent(v && !child);
          }}
          testID="toggle-analytics"
        />
      </View>
      <Pressable onPress={() => void ads.privacyOptions()} style={s.btn} testID="settings-privacy-ad-choices" accessibilityRole="button">
        <Text style={s.btnText}>Privacy & ad choices</Text>
      </Pressable>
      <Text style={s.note} testID="settings-ads-mode">
        {child || ads.nonPersonalised ? "Ads are non-personalised." : "Ads may be personalised (based on your consent)."}
        {ads.isMock ? "  ·  TEST MODE — no real ads in this preview." : ""}
      </Text>
      <Text style={[s.note, removeAds && s.on]} testID="settings-remove-ads-status">
        Remove Ads: {removeAds ? "Active" : "Not purchased"}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  h: { fontFamily: fonts.display, fontSize: 18, color: c.onSurface, marginTop: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm },
  btn: { minHeight: 48, borderRadius: radius.md, borderWidth: 2, borderColor: c.brandPrimary, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  btnText: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: c.onSurface },
  note: { fontFamily: fonts.bodyHeavy, fontSize: 13, color: c.muted },
  on: { color: c.success },
}));

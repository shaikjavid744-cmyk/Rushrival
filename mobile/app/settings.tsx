import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConfirmationDialog } from "@/src/components/ui/ConfirmationDialog";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { ToggleTile } from "@/src/components/ui/ToggleTile";
import { PrivacySettings } from "@/src/monetization/PrivacySettings";
import { LANGUAGES } from "@/src/i18n";
import { Graphics } from "@/src/save/schema";
import { devFlags, useGame } from "@/src/state/GameProvider";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { requestNotificationPermission } from "@/src/services/notifications";

export default function Settings() {
  const s = useStyles();
  const { colors } = useTheme();
  const [notifDenied, setNotifDenied] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { save, updateSettings, resetProgress, update, showToast } = useGame();
  const st = save.settings;
  const [confirmReset, setConfirmReset] = useState(false);
  const [, force] = useState(0);

  const Seg = <T extends string>({ value, options, onPick, id }: { value: T; options: { v: T; l: string }[]; onPick: (v: T) => void; id: string }) => (
    <View style={s.seg}>
      {options.map((o) => (
        <Pressable key={o.v} onPress={() => onPick(o.v)} style={[s.segBtn, value === o.v && s.segOn]} testID={`${id}-${o.v}`} accessibilityRole="radio" accessibilityState={{ selected: value === o.v, checked: value === o.v }} aria-checked={value === o.v} aria-selected={value === o.v}>
          <Text style={[s.segText, value === o.v && s.segTextOn]}>{o.l}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={s.root} testID="settings-screen">
      <ScreenHeader title="Settings" testID="settings-header" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={s.h}>Audio & Feel</Text>
        <View style={s.row}>
          <ToggleTile label="Sound" iconOn="volume-high" iconOff="volume-mute" value={st.sound} onChange={(v) => updateSettings({ sound: v })} testID="toggle-sound" />
          <ToggleTile label="Music" iconOn="musical-notes" iconOff="musical-note" value={st.music} onChange={(v) => updateSettings({ music: v })} testID="toggle-music" />
          <ToggleTile label="Vibration" iconOn="phone-portrait" iconOff="phone-portrait-outline" value={st.vibration} onChange={(v) => updateSettings({ vibration: v })} testID="toggle-vibration" />
        </View>
        <PrivacySettings />
        <Text style={s.h}>Controls & Accessibility</Text>
        <View style={s.row}>
          <ToggleTile label="On-screen buttons" iconOn="game-controller" iconOff="game-controller-outline" value={st.accessibilityButtons} onChange={(v) => updateSettings({ accessibilityButtons: v })} testID="toggle-accessibility-buttons" />
          <ToggleTile label="Large text" iconOn="text" iconOff="text-outline" value={st.largeText} onChange={(v) => updateSettings({ largeText: v })} testID="toggle-large-text" />
        </View>
        <Text style={s.h}>Notifications & Privacy</Text>
        <View style={s.row}>
          <ToggleTile
            label="Notifications"
            iconOn="notifications"
            iconOff="notifications-off"
            value={st.notifications}
            onChange={async (v) => {
              if (!v) return updateSettings({ notifications: false });
              const r = await requestNotificationPermission();
              updateSettings({ notifications: r === "granted" });
              if (r !== "granted") setNotifDenied(true);
            }}
            testID="toggle-notifications"
          />
          <ToggleTile label="Personalised ads" iconOn="person" iconOff="person-outline" value={!!st.adPersonalisation} onChange={(v) => updateSettings({ adPersonalisation: v })} testID="toggle-ad-personalisation" />
        </View>
        {notifDenied ? (
          <View style={s.row}>
            <Text style={s.h} testID="settings-notif-denied">Notifications are blocked by the system.</Text>
            <Pressable onPress={() => Linking.openSettings()} testID="settings-open-system-settings" accessibilityRole="button" accessibilityLabel="Open system settings">
              <Text style={[s.h, { color: colors.accent }]}>Open Settings</Text>
            </Pressable>
          </View>
        ) : null}
        <Text style={s.h}>Graphics quality</Text>
        <Seg<Graphics> id="graphics" value={st.graphics} onPick={(v) => updateSettings({ graphics: v })} options={[{ v: "low", l: "Low" }, { v: "medium", l: "Medium" }, { v: "high", l: "High" }]} />
        <Text style={s.h}>Language</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.langRow} contentContainerStyle={s.langRowContent} testID="language-row">
          {LANGUAGES.map((l) => (
            <Pressable key={l.id} onPress={() => updateSettings({ language: l.id })} style={[s.langChip, st.language === l.id && s.segOn]} testID={`language-${l.id}`} accessibilityRole="radio" accessibilityState={{ selected: st.language === l.id, checked: st.language === l.id }} aria-checked={st.language === l.id}>
              <Text style={[s.segText, st.language === l.id && s.segTextOn]}>{l.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={s.h}>Help & Legal</Text>
        <Pressable style={[s.linkBtn, { flexGrow: 0, flexShrink: 0, flexBasis: "auto" }]} onPress={() => router.push("/account")} testID="settings-account" accessibilityRole="button"><Text style={s.linkText}>Account & cloud save</Text></Pressable>
        <Pressable style={[s.linkBtn, { flexGrow: 0, flexShrink: 0, flexBasis: "auto" }]} onPress={() => router.push("/tutorial?replay=1")} testID="settings-replay-tutorial" accessibilityRole="button"><Text style={s.linkText}>Replay tutorial</Text></Pressable>
        <View style={s.row}>
          <Pressable style={s.linkBtn} onPress={() => router.push("/help")} testID="settings-help" accessibilityRole="button"><Text style={s.linkText}>Help</Text></Pressable>
          <Pressable style={s.linkBtn} onPress={() => router.push("/legal/privacy")} testID="settings-privacy" accessibilityRole="link"><Text style={s.linkText}>Privacy</Text></Pressable>
          <Pressable style={s.linkBtn} onPress={() => router.push("/legal/terms")} testID="settings-terms" accessibilityRole="link"><Text style={s.linkText}>Terms</Text></Pressable>
        </View>

        <Text style={s.h}>Account</Text>
        <Pressable style={s.danger} onPress={() => setConfirmReset(true)} testID="settings-reset-progress" accessibilityRole="button">
          <Text style={s.dangerText}>Reset progress</Text>
        </Pressable>
        <Text style={s.about} testID="settings-about">Rush Rivals v2.0 (Phase 2) · Velactra Game Studio · Progress is stored only on this device.</Text>

        {__DEV__ ? (
          <View style={s.dev} testID="settings-dev-panel">
            <Text style={s.h}>Developer (dev builds only)</Text>
            <Pressable style={s.devBtn} onPress={() => { update((d) => ({ ...d, coins: d.coins + 50000, gems: d.gems + 500 })); showToast("DEV: +50,000 coins, +500 gems", "info"); }} testID="dev-grant-coins">
              <Text style={s.devText}>Grant 50k coins + 500 gems</Text>
            </Pressable>
            <Pressable style={s.devBtn} onPress={() => { devFlags.failSaves = !devFlags.failSaves; force((n) => n + 1); }} testID="dev-toggle-save-failure">
              <Text style={s.devText}>Simulate save failure: {devFlags.failSaves ? "ON" : "OFF"}</Text>
            </Pressable>
            <Pressable style={s.devBtn} onPress={() => { devFlags.clockOffsetDays += 1; force((n) => n + 1); }} testID="dev-clock-plus-day">
              <Text style={s.devText}>Clock offset +1 day (now {devFlags.clockOffsetDays}d)</Text>
            </Pressable>
            <Pressable style={s.devBtn} onPress={() => { devFlags.clockOffsetDays -= 1; force((n) => n + 1); }} testID="dev-clock-minus-day">
              <Text style={s.devText}>Clock offset −1 day</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      {confirmReset ? (
        <ConfirmationDialog
          testID="reset-dialog"
          title="Reset all progress?"
          message="Coins, gems, unlocks, XP and best score will be permanently deleted from this device."
          confirmLabel="Reset"
          destructive
          onConfirm={async () => {
            setConfirmReset(false);
            await resetProgress();
            router.replace("/onboarding");
          }}
          onCancel={() => setConfirmReset(false)}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.md, gap: spacing.sm },
  h: { fontFamily: fonts.display, fontSize: 18, color: c.onSurface, marginTop: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm },
  seg: { flexDirection: "row", gap: 6, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: 4 },
  segBtn: { flex: 1, height: 44, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  segOn: { backgroundColor: c.brandPrimary },
  segText: { fontFamily: fonts.bodyHeavy, fontSize: 13, color: c.muted },
  segTextOn: { color: c.onBrandPrimary },
  langRow: { flexGrow: 0, height: 56 },
  langRowContent: { gap: spacing.sm, alignItems: "center", paddingHorizontal: 2 },
  langChip: { flexShrink: 0, height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, justifyContent: "center" },
  danger: { height: 52, borderRadius: radius.md, borderWidth: 2, borderColor: c.error, alignItems: "center", justifyContent: "center" },
  dangerText: { fontFamily: fonts.display, fontSize: 17, color: c.error },
  linkBtn: { flex: 1, height: 48, borderRadius: radius.md, borderWidth: 2, borderColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  linkText: { fontFamily: fonts.display, fontSize: 15, color: c.onSurface },
  about: { fontFamily: fonts.body, fontSize: 12, color: c.muted, textAlign: "center", marginTop: spacing.sm },
  dev: { marginTop: spacing.md, gap: spacing.sm, borderTopWidth: 1, borderColor: c.border, paddingTop: spacing.sm },
  devBtn: { minHeight: 44, borderRadius: radius.sm, backgroundColor: c.surfaceSecondary, justifyContent: "center", paddingHorizontal: spacing.md },
  devText: { fontFamily: fonts.bodyHeavy, color: c.warning },
}));

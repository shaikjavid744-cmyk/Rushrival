import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { useGame } from "@/src/state/GameProvider";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const FAQ = [
  { q: "How do I get on top of trains?", a: "Run straight up a yellow ramp in front of a parked train. While on the roof you can jump from roof to roof. Swipe down in the air to drop fast." },
  { q: "Which trains are dangerous?", a: "Trains with flashing red lights and a warning sign are moving toward you — change lanes early. Running into the front of any train ends the run." },
  { q: "What do power-ups do?", a: "Magnet pulls coins in, Shield absorbs one crash, Speed makes you invincible briefly, x2 doubles score. Double-tap the track to ride a hoverboard (absorbs one crash)." },
  { q: "Is my progress saved?", a: "Yes, on this device after every run. There is no cloud sync in this version, so uninstalling the app deletes progress." },
  { q: "Can I buy gems?", a: "Not yet — the store opens in a future update. You can earn gems from daily rewards, missions and the inbox." },
];

export default function Help() {
  const s = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { showToast } = useGame();
  const [open, setOpen] = useState<number | null>(0);

  const contact = async () => {
    const url = "mailto:support@velactra.games?subject=Rush%20Rivals%20support";
    try {
      await Linking.openURL(url);
    } catch {
      showToast("No email app found. Write to support@velactra.games", "info");
    }
  };

  return (
    <View style={s.root} testID="help-screen">
      <ScreenHeader title="Help & Support" testID="help-header" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
        {FAQ.map((f, i) => (
          <Pressable key={f.q} onPress={() => setOpen(open === i ? null : i)} style={s.card} testID={`faq-${i}`} accessibilityRole="button" accessibilityState={{ expanded: open === i }}>
            <View style={s.row}>
              <Text style={s.q}>{f.q}</Text>
              <Ionicons name={open === i ? "chevron-up" : "chevron-down"} size={20} color={colors.muted} />
            </View>
            {open === i ? <Text style={s.a}>{f.a}</Text> : null}
          </Pressable>
        ))}
        <Pressable style={s.link} onPress={() => router.push("/support")} testID="help-report-problem" accessibilityRole="button">
          <Text style={s.linkText}>Report a problem</Text>
        </Pressable>
        <Pressable style={s.link} onPress={contact} testID="help-contact-support" accessibilityRole="button">
          <Ionicons name="mail" size={20} color={colors.accent} />
          <Text style={s.linkText}>Contact support</Text>
        </Pressable>
        <Pressable style={s.link} onPress={() => router.push("/legal/privacy")} testID="help-privacy" accessibilityRole="link">
          <Ionicons name="lock-closed" size={20} color={colors.accent} />
          <Text style={s.linkText}>Privacy Policy</Text>
        </Pressable>
        <Pressable style={s.link} onPress={() => router.push("/legal/terms")} testID="help-terms" accessibilityRole="link">
          <Ionicons name="document-text" size={20} color={colors.accent} />
          <Text style={s.linkText}>Terms of Service</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.md, gap: spacing.sm },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: c.border },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  q: { flex: 1, fontFamily: fonts.bodyHeavy, fontSize: 15, color: c.onSurface },
  a: { fontFamily: fonts.body, fontSize: 14, color: c.onSurfaceSecondary, lineHeight: 20 },
  link: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 52, borderRadius: radius.md, borderWidth: 2, borderColor: c.brandPrimary, paddingHorizontal: spacing.md },
  linkText: { fontFamily: fonts.display, fontSize: 16, color: c.onSurface },
}));

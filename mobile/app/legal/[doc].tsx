import { useLocalSearchParams } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { fonts, makeStyles, spacing } from "@/src/theme";

const DOCS = {
  privacy: {
    title: "Privacy Policy",
    sections: [
      ["What we store", "Your runner name, progress, coins, gems, unlocks and settings are stored only on this device."],
      ["What we collect", "Nothing. This version has no accounts, analytics, advertising or tracking, and makes no network requests during gameplay."],
      ["Children", "Players under 13 get child mode: purchase prompts remind them to ask a parent. No personal data is collected from anyone."],
      ["Deleting data", "Use Settings → Reset progress, or uninstall the app."],
      ["Contact", "support@velactra.games"],
    ],
  },
  terms: {
    title: "Terms of Service",
    sections: [
      ["License", "Velactra Game Studio grants you a personal, non-transferable licence to play Rush Rivals."],
      ["Virtual items", "Coins, gems and unlocks have no real-world value and cannot be exchanged for money."],
      ["Fair play", "Do not modify the game or its save files to gain an advantage."],
      ["Changes", "We may update the game and these terms. Continued play means you accept the updated terms."],
      ["Disclaimer", "The game is provided as is, without warranties of any kind."],
    ],
  },
} as const;

export default function Legal() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const d = doc === "terms" ? DOCS.terms : DOCS.privacy;
  return (
    <View style={s.root} testID={`legal-${doc === "terms" ? "terms" : "privacy"}`}>
      <ScreenHeader title={d.title} testID="legal-header" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={s.updated}>Last updated: September 2026</Text>
        {d.sections.map(([h, b]) => (
          <View key={h} style={s.sec}>
            <Text style={s.h}>{h}</Text>
            <Text style={s.b}>{b}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  updated: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: c.muted },
  sec: { gap: 4 },
  h: { fontFamily: fonts.display, fontSize: 18, color: c.onSurface },
  b: { fontFamily: fonts.body, fontSize: 14, color: c.onSurfaceSecondary, lineHeight: 21 },
}));

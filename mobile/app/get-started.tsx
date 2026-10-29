import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/src/components/ui/PrimaryButton";
import { BOARDS, CHARACTERS } from "@/src/config/catalog";
import { useGame } from "@/src/state/GameProvider";
import { fonts, makeStyles, radius, spacing } from "@/src/theme";

/** REQ-58: character + board introduction after the tutorial, then "Get Started" → Main Menu. */
export default function GetStarted() {
  const s = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { save } = useGame();
  const ch = CHARACTERS.find((c) => c.id === save.equipped.character) ?? CHARACTERS[0];
  const bd = BOARDS.find((b) => b.id === save.equipped.board) ?? BOARDS[0];
  return (
    <View style={[s.root, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]} testID="get-started-screen">
      <Text style={s.title}>Meet your runner</Text>
      <View style={s.row}>
        <Animated.View entering={FadeInDown.duration(350)} style={s.card} testID="get-started-character">
          <Image source={ch.image} style={s.char} contentFit="contain" accessibilityLabel={ch.name} />
          <Text style={s.name}>{ch.name}</Text>
          <Text style={s.sub}>Your character</Text>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(150).duration(350)} style={s.card} testID="get-started-board">
          <Image source={bd.image} style={s.board} contentFit="contain" accessibilityLabel={`${bd.name} board`} />
          <Text style={s.name}>{bd.name} board</Text>
          <Text style={s.sub}>Double-tap in a run to ride</Text>
        </Animated.View>
      </View>
      <Text style={s.body}>Unlock more characters, boards and worlds with coins and gems from the Main Menu.</Text>
      <PrimaryButton label="Get Started" variant="gold" size="xl" heavyHaptic onPress={() => router.replace("/menu")} testID="get-started-button" />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface, paddingHorizontal: spacing.lg, justifyContent: "center", gap: spacing.lg },
  title: { fontFamily: fonts.display, fontSize: 32, color: c.onSurface, textAlign: "center" },
  row: { flexDirection: "row", gap: spacing.md },
  card: { flex: 1, alignItems: "center", backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 2, borderColor: c.brandPrimary, padding: spacing.md, gap: 4 },
  char: { width: "100%", height: 200 },
  board: { width: "100%", height: 200 },
  name: { fontFamily: fonts.display, fontSize: 18, color: c.onSurface, textAlign: "center" },
  sub: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: c.muted, textAlign: "center" },
  body: { fontFamily: fonts.body, fontSize: 14, color: c.onSurfaceSecondary, textAlign: "center" },
}));

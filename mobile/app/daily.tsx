import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/src/components/ui/PrimaryButton";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { DAILY_REWARDS } from "@/src/config/catalog";
import { UI_IMAGES } from "@/src/game/sprites";
import { dailyStatus } from "@/src/save/economy";
import { now, useGame } from "@/src/state/GameProvider";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function Daily() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { save, claimDaily, showToast } = useGame();
  const st = dailyStatus(save, now());
  // Day highlighted as "today": next claimable day, or the day already claimed today.
  const today = st.canClaim ? st.nextStreak : save.daily.streak;

  const onClaim = () => {
    const day = claimDaily();
    if (day == null) return;
    const r = DAILY_REWARDS[day - 1];
    showToast(`Day ${day}: +${r.amount} ${r.currency}`, "success");
  };

  return (
    <View style={s.root} testID="daily-screen">
      <ScreenHeader title="Daily Rewards" testID="daily-header" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={s.sub}>Come back every day. Missing a day restarts the streak at Day 1.</Text>
        <View style={s.grid}>
          {DAILY_REWARDS.map((r, i) => {
            const d = i + 1;
            const claimed = st.canClaim ? d < today : d <= today;
            const isToday = d === today;
            return (
              <View key={d} style={[s.tile, d === 7 && s.tileBig, isToday && s.tileToday, claimed && s.tileDone]} testID={`daily-day-${d}`}>
                <Text style={s.day}>Day {d}</Text>
                {r.currency === "coins" ? <Image source={UI_IMAGES.coin} style={{ width: 32, height: 32 }} /> : <Ionicons name="diamond" size={30} color={colors.gem} />}
                <Text style={[s.amt, { color: r.currency === "coins" ? colors.gold : colors.gem }]}>{r.amount}</Text>
                {claimed ? <Ionicons name="checkmark-circle" size={22} color={colors.success} style={s.check} /> : null}
              </View>
            );
          })}
        </View>
        {st.reason === "clock" ? (
          <Text style={s.warn} testID="daily-clock-warning">Your device clock looks earlier than your last claim. Rewards resume once the date catches up.</Text>
        ) : null}
        <PrimaryButton label={st.canClaim ? `Claim Day ${st.nextStreak}` : "Come back tomorrow"} variant={st.canClaim ? "gold" : "navy"} size="lg" disabled={!st.canClaim} onPress={onClaim} testID="daily-claim-button" />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.md, gap: spacing.md },
  sub: { fontFamily: fonts.body, fontSize: 14, color: c.onSurfaceSecondary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: { width: "31%", flexGrow: 1, aspectRatio: 0.9, borderRadius: radius.md, borderWidth: 2, borderColor: c.border, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", gap: 4 },
  tileBig: { width: "100%", aspectRatio: 3 },
  tileToday: { borderColor: c.gold, backgroundColor: c.surfaceTertiary },
  tileDone: { opacity: 0.6 },
  day: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: c.muted },
  amt: { fontFamily: fonts.display, fontSize: 20 },
  check: { position: "absolute", top: 6, right: 6 },
  warn: { fontFamily: fonts.bodyHeavy, color: c.warning, textAlign: "center" },
}));

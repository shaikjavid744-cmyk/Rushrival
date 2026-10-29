import Ionicons from "@react-native-vector-icons/ionicons";
import React, { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RewardDialog } from "@/src/components/ui/RewardDialog";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { ACHIEVEMENTS, Goal, MISSIONS } from "@/src/config/catalog";
import { goalStatus } from "@/src/save/missions";
import { useGame } from "@/src/state/GameProvider";
import { useAccount } from "@/src/online/AccountProvider";
import { ServerMissions } from "@/src/online/ServerMissions";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Tab = "missions" | "achievements";

function MissionCard({ goal, onClaim }: { goal: Goal; onClaim: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { save } = useGame();
  const { progress, state } = goalStatus(save, goal);
  const pct = Math.round((progress / goal.target) * 100);
  return (
    <View style={[s.card, state === "ready" && s.cardReady]} testID={`goal-${goal.id}`}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={s.title}>{goal.title}</Text>
        <View style={s.barBg}>
          <View style={[s.bar, { width: `${pct}%` }]} />
        </View>
        <Text style={s.prog} testID={`goal-${goal.id}-progress`}>
          {progress.toLocaleString()} / {goal.target.toLocaleString()}
        </Text>
      </View>
      {state === "claimed" ? (
        <View style={s.done} testID={`goal-${goal.id}-claimed`}>
          <Ionicons name="checkmark-circle" size={28} color={colors.success} />
        </View>
      ) : (
        <Pressable
          disabled={state !== "ready"}
          onPress={onClaim}
          style={({ pressed }) => [s.claim, state !== "ready" && s.claimOff, pressed && { transform: [{ scale: 0.95 }] }]}
          testID={`goal-${goal.id}-claim`}
          accessibilityRole="button"
          accessibilityLabel={`Claim ${goal.reward.amount} ${goal.reward.currency}`}
          accessibilityState={{ disabled: state !== "ready" }}
        >
          <Ionicons name={goal.reward.currency === "gems" ? "diamond" : "ellipse"} size={16} color={goal.reward.currency === "gems" ? colors.gem : colors.gold} />
          <Text style={s.claimText}>{goal.reward.amount.toLocaleString()}</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function Missions() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { claimGoal } = useGame();
  const { signedIn } = useAccount();
  const [tab, setTab] = useState<Tab>("missions");
  const [reward, setReward] = useState<Goal | null>(null);
  const data = tab === "missions" ? MISSIONS : ACHIEVEMENTS;

  return (
    <View style={s.root} testID="missions-screen">
      <ScreenHeader title="Missions" testID="missions-header" />
      <View style={s.tabs}>
        {(["missions", "achievements"] as Tab[]).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[s.tab, tab === t && s.tabOn]} testID={`missions-tab-${t}`} accessibilityRole="tab" accessibilityState={{ selected: tab === t }}>
            <Text style={[s.tabText, tab === t && s.tabTextOn]}>{t === "missions" ? "Missions" : "Achievements"}</Text>
          </Pressable>
        ))}
      </View>
      {signedIn ? (
        <ServerMissions tab={tab} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(g) => g.id}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + spacing.lg }]}
          renderItem={({ item }) => <MissionCard goal={item} onClaim={() => claimGoal(item.id) && setReward(item)} />}
        />
      )}
      {reward ? <RewardDialog title="Mission complete!" reward={reward.reward} onClose={() => setReward(null)} testID="mission-reward-dialog" /> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  tabs: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, height: 60 },
  tab: { flex: 1, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  tabOn: { backgroundColor: c.brandPrimary },
  tabText: { fontFamily: fonts.display, fontSize: 15, color: c.muted },
  tabTextOn: { color: c.onBrandPrimary },
  list: { padding: spacing.md, gap: spacing.sm },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 2, borderColor: c.border, padding: spacing.md },
  cardReady: { borderColor: c.gold },
  title: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: c.onSurface },
  barBg: { height: 8, borderRadius: 4, backgroundColor: c.surface, overflow: "hidden" },
  bar: { height: "100%", backgroundColor: c.accent },
  prog: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: c.muted },
  claim: { flexDirection: "row", alignItems: "center", gap: 4, height: 44, minWidth: 84, justifyContent: "center", borderRadius: radius.md, backgroundColor: c.success, paddingHorizontal: spacing.sm },
  claimOff: { backgroundColor: c.surface, opacity: 0.7 },
  claimText: { fontFamily: fonts.display, fontSize: 15, color: c.onSurface },
  done: { width: 84, alignItems: "center" },
}));

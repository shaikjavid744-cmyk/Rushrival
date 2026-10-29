import Ionicons from "@react-native-vector-icons/ionicons";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/src/components/ui/EmptyState";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { useGame } from "@/src/state/GameProvider";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

/** Profile, lifetime statistics and the local (on-device) leaderboard of best runs. */
export default function Profile() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { save, level, update, showToast } = useGame();
  const [name, setName] = useState(save.name);
  const [editing, setEditing] = useState(false);

  const saveName = () => {
    const n = name.trim() || "Runner";
    update((d) => ({ ...d, name: n }));
    setName(n);
    setEditing(false);
    showToast("Name updated", "success");
  };

  const stats: [string, string][] = [
    ["Runs", save.stats.totalRuns.toLocaleString()],
    ["Distance", `${save.stats.totalDistance.toLocaleString()} m`],
    ["Coins collected", save.stats.totalCoins.toLocaleString()],
    ["Power-ups used", save.stats.powerupsUsed.toLocaleString()],
    ["Best score", save.bestScore.toLocaleString()],
  ];

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined} testID="profile-screen">
      <ScreenHeader title="Profile" testID="profile-header" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{save.name.slice(0, 1).toUpperCase()}</Text>
          </View>
          {editing ? (
            <View style={s.editRow}>
              <TextInput value={name} onChangeText={(v) => setName(v.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 16))} style={s.input} autoFocus maxLength={16} onSubmitEditing={saveName} returnKeyType="done" testID="profile-name-input" accessibilityLabel="Runner name" />
              <Pressable onPress={saveName} style={s.iconBtn} testID="profile-name-save" accessibilityLabel="Save name">
                <Ionicons name="checkmark" size={24} color={colors.onSurface} />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setEditing(true)} style={s.nameRow} testID="profile-edit-name" accessibilityRole="button" accessibilityLabel={`Name ${save.name}. Edit`}>
              <Text style={s.name}>{save.name}</Text>
              <Ionicons name="pencil" size={18} color={colors.muted} />
            </Pressable>
          )}
          <Text style={s.level} testID="profile-level">Level {level.level}</Text>
          <View style={s.xpBg}>
            <View style={[s.xp, { width: `${Math.round((level.into / level.need) * 100)}%` }]} />
          </View>
          <Text style={s.xpText}>{level.into} / {level.need} XP</Text>
        </View>

        <Text style={s.h}>Statistics</Text>
        <View style={s.statsCard}>
          {stats.map(([k, v]) => (
            <View key={k} style={s.statRow}>
              <Text style={s.statKey}>{k}</Text>
              <Text style={s.statVal} testID={`stat-${k.toLowerCase().replace(/ /g, "-")}`}>{v}</Text>
            </View>
          ))}
        </View>

        <Text style={s.h}>Leaderboard · this device</Text>
        <View style={s.statsCard} testID="local-leaderboard">
          {save.bests.length === 0 ? (
            <EmptyState icon="trophy" title="No runs yet" message="Your top 10 scores will appear here." testID="leaderboard-empty" />
          ) : (
            save.bests.map((b, i) => (
              <View key={`${i}-${b}`} style={s.statRow} testID={`leaderboard-row-${i + 1}`}>
                <Text style={[s.rank, i === 0 && { color: colors.gold }]}>#{i + 1}</Text>
                <Text style={s.statKey}>{save.name}</Text>
                <Text style={s.statVal}>{b.toLocaleString()}</Text>
              </View>
            ))
          )}
        </View>
        <Text style={s.note}>Online leaderboards arrive with accounts in a later update.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.md, gap: spacing.sm },
  card: { alignItems: "center", backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 2, borderColor: c.brandPrimary, padding: spacing.lg, gap: 6 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: c.onSurface },
  avatarText: { fontFamily: fonts.display, fontSize: 36, color: c.onBrandPrimary },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 },
  name: { fontFamily: fonts.display, fontSize: 24, color: c.onSurface },
  editRow: { flexDirection: "row", gap: spacing.sm, alignSelf: "stretch" },
  input: { flex: 1, height: 48, borderRadius: radius.md, borderWidth: 2, borderColor: c.brandPrimary, color: c.onSurface, paddingHorizontal: spacing.md, fontFamily: fonts.bodyHeavy, fontSize: 17, backgroundColor: c.surface },
  iconBtn: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: c.success, alignItems: "center", justifyContent: "center" },
  level: { fontFamily: fonts.bodyHeavy, color: c.gold },
  xpBg: { alignSelf: "stretch", height: 10, borderRadius: 5, backgroundColor: c.surface, overflow: "hidden" },
  xp: { height: "100%", backgroundColor: c.accent },
  xpText: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: c.muted },
  h: { fontFamily: fonts.display, fontSize: 18, color: c.onSurface, marginTop: spacing.sm },
  statsCard: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md },
  statRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44, borderBottomWidth: 1, borderColor: c.divider },
  rank: { width: 36, fontFamily: fonts.display, fontSize: 16, color: c.muted },
  statKey: { flex: 1, fontFamily: fonts.bodyHeavy, fontSize: 14, color: c.onSurfaceSecondary },
  statVal: { fontFamily: fonts.display, fontSize: 16, color: c.onSurface },
  note: { fontFamily: fonts.body, fontSize: 12, color: c.muted, textAlign: "center" },
}));

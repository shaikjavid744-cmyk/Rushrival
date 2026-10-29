import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/src/components/ui/EmptyState";
import { PrimaryButton } from "@/src/components/ui/PrimaryButton";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { useAccount } from "@/src/online/AccountProvider";
import { online } from "@/src/online/online";
import { useOnlineStyles } from "@/src/online/styles";
import { useGame } from "@/src/state/GameProvider";
import { useTheme } from "@/src/theme";

type Period = "daily" | "weekly" | "all";
interface Row { rank: number; user_id: string; name: string; score: number; me: boolean }

export default function Leaderboard() {
  const s = useOnlineStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signedIn, config } = useAccount();
  const { showToast, save } = useGame();
  const [period, setPeriod] = useState<Period>("daily");
  const [rows, setRows] = useState<Row[]>([]);
  const [me, setMe] = useState<{ rank: number; score: number } | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  const load = useCallback(async (p: Period, more?: string | null) => {
    if (!more) setState("loading");
    try {
      const r = await online.request<{ items: Row[]; me: any; next_cursor: string | null }>(`/leaderboard?period=${p}&limit=25${more ? `&cursor=${more}` : ""}`);
      setRows((prev) => (more ? [...prev, ...r.items] : r.items));
      setMe(r.me);
      setCursor(r.next_cursor);
      setState("ok");
    } catch {
      setState("error");
    }
  }, []);
  useEffect(() => {
    if (signedIn) void load(period);
  }, [period, load, signedIn]);

  const report = async (row: Row) => {
    try {
      await online.request("/reports", { method: "POST", body: { target_user_id: row.user_id, reason: "cheating" } });
      showToast(`Reported ${row.name}. Thanks — our team will review it.`, "success");
    } catch (e) {
      showToast((e as any).message ?? "Couldn't send report", "error");
    }
  };

  const tabs = (
    <View style={[s.tabs, { paddingHorizontal: 16, paddingVertical: 6, height: 56 }]}>
      {(["daily", "weekly", "all"] as Period[]).map((p) => (
        <Pressable key={p} onPress={() => setPeriod(p)} style={[s.tab, period === p && s.tabOn]} testID={`leaderboard-tab-${p}`} accessibilityRole="tab" accessibilityState={{ selected: period === p }}>
          <Text style={s.tabText}>{p === "daily" ? "Daily" : p === "weekly" ? "Weekly" : "All Time"}</Text>
        </Pressable>
      ))}
    </View>
  );
  return (
    <View style={s.root} testID="leaderboard-screen">
      <ScreenHeader title="Leaderboard" testID="leaderboard-header" />
      {tabs}
      {!config.flags.leaderboard ? (
        <EmptyState icon="podium" title="Leaderboards are paused" message="Check back soon." testID="leaderboard-disabled" />
      ) : !signedIn ? (
        <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 24 }]} testID="leaderboard-signed-out">
          <Pressable onPress={() => router.push("/account")} style={s.card} testID="leaderboard-signin-cta" accessibilityRole="button">
            <Text style={s.title}>Sign in to compete</Text>
            <Text style={s.text}>Sign in to post scores to the global leaderboard and see your rank.</Text>
            <Text style={s.link}>Sign in</Text>
          </Pressable>
          <Text style={s.title}>Your personal bests</Text>
          {save.bests.length === 0 ? (
            <Text style={s.muted} testID="leaderboard-bests-empty">No runs yet — play to set your first best!</Text>
          ) : (
            save.bests.slice(0, 10).map((b, i) => (
              <View key={i} style={s.lbRow} testID={`leaderboard-best-${i + 1}`}>
                <Text style={s.rank}>#{i + 1}</Text>
                <Text style={s.name}>{i === 0 ? "Best run" : "Run"}</Text>
                <Text style={s.score}>{b.toLocaleString()}</Text>
              </View>
            ))
          )}
        </ScrollView>
      ) : state === "error" ? (
        <View style={s.center} testID="leaderboard-unavailable">
          <Ionicons name="cloud-offline" size={48} color={colors.muted} />
          <Text style={s.title}>Service unavailable</Text>
          <Text style={s.muted}>We couldn&apos;t load the leaderboard. Check your connection.</Text>
          <PrimaryButton label="Retry" onPress={() => load(period)} testID="leaderboard-retry" />
        </View>
      ) : state === "loading" ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.gold} testID="leaderboard-loading" />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.user_id}
          contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => load(period)} tintColor={colors.gold} />}
          onEndReached={() => cursor && load(period, cursor)}
          ListHeaderComponent={
            me ? (
              <Text style={s.ok} testID="leaderboard-my-rank">Your rank: #{me.rank} · {me.score}</Text>
            ) : undefined
          }
          ListEmptyComponent={<EmptyState icon="podium" title="No scores yet" message="Be the first to post a score today!" testID="leaderboard-empty" />}
          renderItem={({ item }) => (
            <View style={[s.lbRow, item.me && s.lbMe]} testID={`leaderboard-row-${item.rank}`}>
              <Text style={s.rank}>#{item.rank}</Text>
              <Text style={s.name} numberOfLines={1}>{item.name}{item.me ? " (you)" : ""}</Text>
              <Text style={s.score}>{item.score}</Text>
              {signedIn && !item.me ? (
                <Pressable onPress={() => report(item)} hitSlop={10} testID={`leaderboard-report-${item.rank}`} accessibilityRole="button" accessibilityLabel={`Report ${item.name}`}>
                  <Ionicons name="flag-outline" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

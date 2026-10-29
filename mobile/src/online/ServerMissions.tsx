import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/src/components/ui/PrimaryButton";
import { useGame } from "@/src/state/GameProvider";
import { useTheme } from "@/src/theme";

import { ApiErr, online, uid } from "./online";
import { useOnlineStyles } from "./styles";

interface Item { id: string; title: string; target: number; progress: number; claimed?: boolean; reward: { coins?: number; gems?: number } }

/** Signed-in missions/achievements: progress comes from server-validated runs; claims are server-side. */
export function ServerMissions({ tab }: { tab: "missions" | "achievements" }) {
  const s = useOnlineStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast } = useGame();
  const [data, setData] = useState<{ items: Item[]; achievements: Item[] } | null>(null);
  const [err, setErr] = useState(false);
  const load = useCallback(() => {
    setErr(false);
    online.request<{ items: Item[]; achievements: Item[] }>("/missions").then(setData).catch(() => setErr(true));
  }, []);
  useEffect(load, [load]);
  const claim = async (it: Item) => {
    try {
      await online.request(`/${tab}/${it.id}/claim`, { method: "POST", idem: uid() });
      await online.pull();
      showToast(`Reward claimed: ${it.reward.coins ? `${it.reward.coins} coins` : `${it.reward.gems} gems`}`, "success");
      load();
    } catch (e) {
      showToast((e as ApiErr).message, "error");
    }
  };
  if (err)
    return (
      <View style={s.center} testID="server-missions-unavailable">
        <Text style={s.title}>Service unavailable</Text>
        <PrimaryButton label="Retry" onPress={load} testID="server-missions-retry" />
      </View>
    );
  if (!data) return <ActivityIndicator style={{ marginTop: 32 }} color={colors.gold} />;
  const list = tab === "missions" ? data.items : data.achievements;
  return (
    <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 24 }]} testID="server-missions">
      <Text style={s.muted}>Cloud missions — progress counts verified runs.</Text>
      {list.map((it) => {
        const done = it.progress >= it.target;
        return (
          <View key={it.id} style={s.card} testID={`server-mission-${it.id}`}>
            <Text style={s.text}>{it.title}</Text>
            <Text style={s.muted}>{Math.min(it.progress, it.target)} / {it.target} · {it.reward.coins ? `${it.reward.coins} coins` : `${it.reward.gems} gems`}</Text>
            {it.claimed ? <Text style={s.ok}>Claimed ✓</Text> : <PrimaryButton label={done ? "Claim" : "In progress"} variant="green" disabled={!done} onPress={() => claim(it)} testID={`server-mission-claim-${it.id}`} />}
          </View>
        );
      })}
    </ScrollView>
  );
}

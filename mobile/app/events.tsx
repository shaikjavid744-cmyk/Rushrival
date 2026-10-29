import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/src/components/ui/EmptyState";
import { PrimaryButton } from "@/src/components/ui/PrimaryButton";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { WORLDS } from "@/src/config/catalog";
import { useAccount } from "@/src/online/AccountProvider";
import { setActiveEvents } from "@/src/online/events";
import { ApiErr, online, uid } from "@/src/online/online";
import { useOnlineStyles } from "@/src/online/styles";
import { useGame } from "@/src/state/GameProvider";
import { useTheme } from "@/src/theme";

interface Ev { event_id: string; name: string; world: string; description: string; rule: { target: number; token_label: string }; rewards: { gems?: number; coins?: number }; seconds_left: number; progress: number | null; claimed: boolean | null }

const left = (sec: number) => (sec > 86400 ? `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h left` : `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m left`);

export default function Events() {
  const s = useOnlineStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signedIn, config } = useAccount();
  const { save, equip, showToast } = useGame();
  const [items, setItems] = useState<Ev[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const r = await online.request<{ items: Ev[] }>("/events");
      setItems(r.items);
      setActiveEvents(r.items);
      setState("ok");
    } catch {
      setState("error");
    }
  }, []);
  useEffect(() => void load(), [load]);

  const play = (ev: Ev) => {
    if (!save.owned.worlds.includes(ev.world)) return showToast(`Unlock the ${ev.world} world in Worlds to play this event`, "info");
    equip("worlds" as never, ev.world);
    router.replace("/run");
  };
  const claim = async (ev: Ev) => {
    try {
      const r = await online.request<{ wallet: any }>(`/events/${ev.event_id}/claim`, { method: "POST", idem: uid() });
      await online.pull();
      showToast(`Event reward claimed! ${r.wallet ? "" : ""}`, "success");
      load();
    } catch (e) {
      showToast((e as ApiErr).message, "error");
    }
  };

  return (
    <View style={s.root} testID="events-screen">
      <ScreenHeader title="Events" testID="events-header" />
      {state === "loading" ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.gold} testID="events-loading" />
      ) : state === "error" ? (
        <View style={s.center} testID="events-unavailable">
          <Ionicons name="cloud-offline" size={48} color={colors.muted} />
          <Text style={s.title}>Service unavailable</Text>
          <Text style={s.muted}>Events need a connection.</Text>
          <PrimaryButton label="Retry" onPress={load} testID="events-retry" />
        </View>
      ) : !config.flags.events || items.length === 0 ? (
        <EmptyState icon="calendar" title="No events right now" message="New events arrive regularly — check back soon!" testID="events-empty" />
      ) : (
        <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 24 }]}>
          {items.map((ev) => {
            const done = (ev.progress ?? 0) >= ev.rule.target;
            const img = WORLDS.find((w) => w.id === ev.world)?.image;
            return (
              <View key={ev.event_id} style={s.card} testID={`event-card-${ev.event_id}`}>
                {img ? <Image source={img} style={{ height: 120, borderRadius: 12 }} contentFit="cover" accessibilityLabel={`${ev.world} world`} /> : null}
                <Text style={s.title}>{ev.name}</Text>
                <Text style={s.text}>{ev.description}</Text>
                <Text style={s.muted} testID="event-time-left">{left(ev.seconds_left)} · Reward: {ev.rewards.gems ? `${ev.rewards.gems} gems ` : ""}{ev.rewards.coins ? `${ev.rewards.coins} coins` : ""}</Text>
                {signedIn ? <Text style={s.ok} testID="event-progress">Best run: {ev.progress ?? 0} / {ev.rule.target} {ev.rule.token_label}</Text> : <Text style={s.muted}>Sign in to track progress and claim rewards.</Text>}
                {signedIn && !ev.claimed ? <PrimaryButton label={done ? "Claim reward" : `Reach ${ev.rule.target} to claim`} variant="gold" disabled={!done} onPress={() => claim(ev)} testID="event-claim" /> : null}
                {ev.claimed ? <Text style={s.ok} testID="event-claimed">Reward claimed ✓</Text> : null}
                <PrimaryButton label="Play event" variant="green" icon="play" onPress={() => play(ev)} testID="event-play" />
                {!signedIn ? <PrimaryButton label="Sign in" variant="navy" onPress={() => router.push("/account")} testID="event-signin" /> : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

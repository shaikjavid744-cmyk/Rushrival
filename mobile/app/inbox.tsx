import Ionicons from "@react-native-vector-icons/ionicons";
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/src/components/ui/EmptyState";
import { RewardDialog } from "@/src/components/ui/RewardDialog";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { INBOX, InboxMessage } from "@/src/config/catalog";
import { useGame } from "@/src/state/GameProvider";
import { useAccount } from "@/src/online/AccountProvider";
import { ApiErr, online, uid } from "@/src/online/online";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function Inbox() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { save, claimInbox, markInboxRead, showToast } = useGame();
  const { signedIn } = useAccount();
  const [open, setOpen] = useState<string | null>(null);
  const [reward, setReward] = useState<InboxMessage | null>(null);
  // Server messages (signed in) merged after the bundled ones; their attachments are claim-once server-side.
  const [server, setServer] = useState<(InboxMessage & { claimed: boolean })[]>([]);
  const loadServer = useCallback(() => {
    if (!signedIn) return setServer([]);
    online
      .request<{ items: any[] }>("/inbox")
      .then((r) => setServer(r.items.filter((m) => !INBOX.some((b) => b.id === m.msg_id)).map((m) => ({ id: m.msg_id, title: m.title, body: m.body, reward: m.attachment?.gems ? { currency: "gems", amount: m.attachment.gems } : m.attachment?.coins ? { currency: "coins", amount: m.attachment.coins } : undefined, claimed: m.claimed }) as InboxMessage & { claimed: boolean })))
      .catch(() => undefined);
  }, [signedIn]);
  useEffect(loadServer, [loadServer]);
  const claimServer = async (m: InboxMessage) => {
    try {
      await online.request(`/inbox/${m.id}/claim`, { method: "POST", idem: uid() });
      await online.pull();
      setReward(m);
      loadServer();
    } catch (e) {
      showToast((e as ApiErr).message, "error");
    }
  };

  return (
    <View style={s.root} testID="inbox-screen">
      <ScreenHeader title="Inbox" testID="inbox-header" />
      <FlatList
        data={[...INBOX, ...server]}
        keyExtractor={(m) => m.id}
        contentContainerStyle={[s.list, { paddingBottom: insets.bottom + spacing.lg }]}
        ListEmptyComponent={<EmptyState icon="mail-open" title="No messages" message="News and gifts will show up here." testID="inbox-empty" />}
        renderItem={({ item }) => {
          const srv = "claimed" in item;
          const read = srv || save.eventIds.includes(`inbox-read:${item.id}`);
          const claimed = srv ? (item as { claimed: boolean }).claimed : save.eventIds.includes(`inbox:${item.id}`);
          const expanded = open === item.id;
          return (
            <View style={[s.card, !read && s.unread]} testID={`inbox-msg-${item.id}`}>
              <Pressable
                style={s.row}
                onPress={() => {
                  setOpen(expanded ? null : item.id);
                  if (!read && !item.reward) markInboxRead(item.id);
                }}
                testID={`inbox-open-${item.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${read ? "" : "Unread. "}${item.title}`}
                accessibilityState={{ expanded }}
                aria-expanded={expanded}
              >
                <Ionicons name={read ? "mail-open" : "mail-unread"} size={22} color={read ? colors.muted : colors.accent} />
                <Text style={s.title}>{item.title}</Text>
                {!read ? <View style={s.dot} /> : null}
              </Pressable>
              {expanded ? (
                <>
                  <Text style={s.body}>{item.body}</Text>
                  {item.reward ? (
                    <Pressable
                      disabled={claimed}
                      onPress={() => ("claimed" in item ? claimServer(item) : claimInbox(item.id) && setReward(item))}
                      style={[s.claim, claimed && s.claimOff]}
                      testID={`inbox-claim-${item.id}`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: claimed }}
                    >
                      <Text style={s.claimText}>{claimed ? "Claimed" : `Claim ${item.reward.amount} ${item.reward.currency}`}</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}
            </View>
          );
        }}
      />
      {reward?.reward ? <RewardDialog title="Gift received!" reward={reward.reward} onClose={() => setReward(null)} testID="inbox-reward-dialog" /> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  list: { padding: spacing.md, gap: spacing.sm },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 2, borderColor: c.border, padding: spacing.md, gap: spacing.sm },
  unread: { borderColor: c.brandPrimary },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 },
  title: { flex: 1, fontFamily: fonts.bodyHeavy, fontSize: 15, color: c.onSurface },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.error },
  body: { fontFamily: fonts.body, fontSize: 14, color: c.onSurfaceSecondary, lineHeight: 20 },
  claim: { height: 44, borderRadius: radius.md, backgroundColor: c.success, alignItems: "center", justifyContent: "center" },
  claimOff: { backgroundColor: c.surface },
  claimText: { fontFamily: fonts.display, fontSize: 15, color: c.onSurface },
}));

import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import React from "react";
import { Pressable, Text, View } from "react-native";

import type { CatalogItem } from "@/src/config/catalog";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export type ItemState = "selected" | "owned" | "locked";

interface Props {
  item: CatalogItem;
  state: ItemState;
  lockedReason?: string;
  onPress: () => void;
  testID: string;
  wide?: boolean;
}

/** Storyboard collection card: portrait art, name, price chip (gold coin / purple gem) or Selected/Owned badge. */
export function ItemCard({ item, state, lockedReason, onPress, testID, wide }: Props) {
  const s = useStyles();
  const { colors } = useTheme();
  const p = item.price;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={`${item.name}, ${state}`} onPress={onPress} style={({ pressed }) => [s.card, state === "selected" && s.selected, pressed && s.pressed]}>
      <View style={s.art}>
        <Image source={item.image} style={wide ? s.imgWide : s.img} contentFit={wide ? "cover" : "contain"} />
        {state === "locked" ? (
          <View style={s.lock}>
            <Ionicons name="lock-closed" size={16} color={colors.onSurface} />
          </View>
        ) : null}
      </View>
      <Text style={s.name} numberOfLines={1}>
        {item.name}
      </Text>
      {state === "selected" ? (
        <View style={[s.chip, { backgroundColor: colors.success }]}>
          <Text style={[s.chipText, { color: colors.onSuccess }]}>Selected</Text>
        </View>
      ) : state === "owned" ? (
        <View style={[s.chip, { backgroundColor: colors.surfaceTertiary }]}>
          <Text style={s.chipText}>Owned</Text>
        </View>
      ) : lockedReason ? (
        <View style={[s.chip, { backgroundColor: colors.surfaceTertiary }]}>
          <Text style={s.chipText}>{lockedReason}</Text>
        </View>
      ) : p && "ad" in p ? (
        <View style={[s.chip, { backgroundColor: colors.surfaceTertiary }]}>
          <Text style={[s.chipText, { color: colors.muted }]} numberOfLines={1}>Soon</Text>
        </View>
      ) : p ? (
        <View style={[s.chip, { backgroundColor: p.currency === "gems" ? colors.gem : colors.gold }]}>
          <Ionicons name={p.currency === "gems" ? "diamond" : "ellipse"} size={12} color={p.currency === "gems" ? colors.onSurface : colors.onGold} />
          <Text style={[s.chipText, { color: p.currency === "gems" ? colors.onSurface : colors.onGold }]}>{p.amount.toLocaleString()}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export const CharacterCard = ItemCard;
export const BoardCard = ItemCard;
export const WorldCard = ItemCard;

const useStyles = makeStyles((c) => ({
  card: { flex: 1, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 2, borderColor: c.border, padding: spacing.sm, alignItems: "center", gap: 6 },
  selected: { borderColor: c.success },
  pressed: { transform: [{ scale: 0.96 }] },
  art: { width: "100%", aspectRatio: 0.8, borderRadius: radius.sm, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  img: { width: "90%", height: "90%" },
  imgWide: { width: "100%", height: "100%" },
  lock: { position: "absolute", top: 6, right: 6, backgroundColor: c.overlayScrim, borderRadius: 12, padding: 4 },
  name: { fontFamily: fonts.display, fontSize: 16, color: c.onSurface },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, minHeight: 22 },
  chipText: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: c.onSurface },
}));

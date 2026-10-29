import { Image } from "expo-image";
import React from "react";
import { Pressable, Text } from "react-native";

import { UI_IMAGES } from "@/src/game/sprites";
import { fonts, makeStyles, radius, spacing } from "@/src/theme";

interface Props {
  amount: number;
  testID: string;
  onLongPress?: () => void;
  delayLongPress?: number;
  compact?: boolean;
}

export function CurrencyBalance({ amount, testID, onLongPress, delayLongPress, compact }: Props) {
  const s = useStyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={`Coins: ${amount}`}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      style={[s.pill, compact && s.compact]}
    >
      <Image source={UI_IMAGES.coin} style={compact ? s.coinSm : s.coin} contentFit="contain" />
      <Text style={[s.amount, compact && s.amountSm]} testID={`${testID}-value`}>
        {amount.toLocaleString()}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.hudPanel,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingLeft: spacing.xs,
    paddingRight: spacing.lg,
    height: 44,
    minWidth: 96,
  },
  compact: { height: 40, minWidth: 80 },
  coin: { width: 34, height: 34, marginRight: spacing.sm },
  coinSm: { width: 30, height: 30, marginRight: spacing.sm },
  amount: { fontFamily: fonts.display, fontSize: 22, color: c.gold },
  amountSm: { fontSize: 20 },
}));

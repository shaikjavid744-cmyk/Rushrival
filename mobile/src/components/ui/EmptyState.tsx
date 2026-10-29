import Ionicons from "@react-native-vector-icons/ionicons";
import React from "react";
import { Text, View } from "react-native";

import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";

type Icon = React.ComponentProps<typeof Ionicons>["name"];

export function EmptyState({ icon, title, message, testID }: { icon: Icon; title: string; message: string; testID: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.wrap} testID={testID}>
      <Ionicons name={icon} size={56} color={colors.muted} />
      <Text style={s.title}>{title}</Text>
      <Text style={s.msg}>{message}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { alignItems: "center", padding: spacing.xl, gap: spacing.sm },
  title: { fontFamily: fonts.display, fontSize: 20, color: c.onSurface },
  msg: { fontFamily: fonts.body, fontSize: 14, color: c.muted, textAlign: "center" },
}));

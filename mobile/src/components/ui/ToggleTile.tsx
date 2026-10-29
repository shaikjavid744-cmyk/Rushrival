import Ionicons from "@react-native-vector-icons/ionicons";
import React from "react";
import { Pressable, Text } from "react-native";

import { haptics } from "@/src/services/haptics";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

interface Props {
  label: string;
  iconOn: React.ComponentProps<typeof Ionicons>["name"];
  iconOff: React.ComponentProps<typeof Ionicons>["name"];
  value: boolean;
  onChange: (v: boolean) => void;
  testID: string;
}

/** Large tappable settings toggle (icon + label + ON/OFF). */
export function ToggleTile({ label, iconOn, iconOff, value, onChange, testID }: Props) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => {
        const next = !value;
        if (next || testID !== "toggle-vibration") haptics.selection();
        onChange(next);
      }}
      style={({ pressed }) => [s.tile, value ? s.on : s.off, pressed && s.pressed]}
    >
      <Ionicons name={value ? iconOn : iconOff} size={24} color={value ? colors.accent : colors.muted} />
      <Text style={s.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[s.state, { color: value ? colors.success : colors.muted }]} testID={`${testID}-state`}>
        {value ? "ON" : "OFF"}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  tile: {
    flex: 1,
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  on: { backgroundColor: c.surfaceTertiary, borderColor: c.brandPrimary },
  off: { backgroundColor: c.surfaceSecondary, borderColor: c.border },
  pressed: { transform: [{ scale: 0.96 }] },
  label: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: c.onSurfaceSecondary, marginTop: 2 },
  state: { fontFamily: fonts.display, fontSize: 13 },
}));

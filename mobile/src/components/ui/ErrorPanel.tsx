import Ionicons from "@react-native-vector-icons/ionicons";
import React from "react";
import { Text, View } from "react-native";

import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

import { PrimaryButton } from "./PrimaryButton";

interface Props {
  title?: string;
  message: string;
  onRetry: () => void;
  testID?: string;
}

export function ErrorPanel({ title = "Something went wrong", message, onRetry, testID = "error-panel" }: Props) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.card} testID={testID}>
      <Ionicons name="warning" size={44} color={colors.error} />
      <Text style={s.title}>{title}</Text>
      <Text style={s.message} testID={`${testID}-message`}>
        {message}
      </Text>
      <PrimaryButton label="Retry" icon="refresh" onPress={onRetry} testID={`${testID}-retry-button`} style={s.btn} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    backgroundColor: c.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: c.error,
    padding: spacing.xl,
  },
  title: { fontFamily: fonts.display, fontSize: 26, color: c.onSurface, marginTop: spacing.sm, textAlign: "center" },
  message: { fontFamily: fonts.body, fontSize: 15, color: c.onSurfaceSecondary, marginTop: spacing.sm, textAlign: "center" },
  btn: { alignSelf: "stretch", marginTop: spacing.xl },
}));

import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";

export function LoadingOverlay({ message = "Loading...", testID = "loading-overlay" }: { message?: string; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, s.wrap]} testID={testID} accessibilityLabel={message}>
      <ActivityIndicator size="large" color={colors.gold} />
      <Text style={s.text}>{message}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { backgroundColor: c.overlayScrim, alignItems: "center", justifyContent: "center" },
  text: { fontFamily: fonts.body, color: c.onSurface, fontSize: 16, marginTop: spacing.md },
}));

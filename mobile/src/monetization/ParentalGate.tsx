import React, { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";

import { PrimaryButton } from "@/src/components/ui/PrimaryButton";
import { SecondaryButton } from "@/src/components/ui/SecondaryButton";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

/** Child mode: a simple grown-up check (math challenge) before any real-money purchase (REQ-181). */
export function ParentalGate({ onPass, onCancel }: { onPass: () => void; onCancel: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const [a, b] = useMemo(() => [12 + Math.floor(Math.random() * 18), 7 + Math.floor(Math.random() * 12)], []);
  const [answer, setAnswer] = useState("");
  const [wrong, setWrong] = useState(false);
  const check = () => (Number(answer) === a + b ? onPass() : setWrong(true));
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[StyleSheet.absoluteFill, s.scrim]} testID="parental-gate">
      <View style={s.card}>
        <Text style={s.title}>Ask a grown-up</Text>
        <Text style={s.body}>Purchases cost real money. A parent or guardian must answer to continue.</Text>
        <Text style={s.q} testID="parental-gate-question">What is {a} + {b}?</Text>
        <TextInput value={answer} onChangeText={(t) => (setAnswer(t.replace(/\D/g, "")), setWrong(false))} keyboardType="number-pad" maxLength={3} style={s.input} placeholder="Answer" placeholderTextColor={colors.muted} onSubmitEditing={check} testID="parental-gate-input" accessibilityLabel="Answer" />
        {wrong ? <Text style={s.err} testID="parental-gate-error">{"That's not right. Ask a grown-up to try again."}</Text> : null}
        <PrimaryButton label="Continue" variant="green" disabled={!answer} onPress={check} testID="parental-gate-confirm" />
        <SecondaryButton label="Cancel" onPress={onCancel} testID="parental-gate-cancel" />
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) => ({
  scrim: { backgroundColor: c.overlayScrim, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  card: { width: "100%", maxWidth: 360, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 2, borderColor: c.borderStrong, padding: spacing.lg, gap: spacing.sm },
  title: { fontFamily: fonts.display, fontSize: 22, color: c.onSurface },
  body: { fontFamily: fonts.body, fontSize: 14, color: c.muted },
  q: { fontFamily: fonts.display, fontSize: 24, color: c.gold, textAlign: "center", marginVertical: spacing.xs },
  input: { height: 52, borderRadius: radius.md, borderWidth: 2, borderColor: c.border, color: c.onSurface, fontFamily: fonts.bodyHeavy, fontSize: 20, textAlign: "center", backgroundColor: c.surface },
  err: { fontFamily: fonts.bodyHeavy, fontSize: 13, color: c.error },
}));

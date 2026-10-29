import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/src/components/ui/PrimaryButton";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { ApiErr, online } from "@/src/online/online";
import { useOnlineStyles } from "@/src/online/styles";

const CATS = ["bug", "account", "purchase", "other"] as const;

export default function Support() {
  const s = useOnlineStyles();
  const insets = useSafeAreaInsets();
  const [cat, setCat] = useState<(typeof CATS)[number]>("bug");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(online.user?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok?: string; err?: string }>({});
  const send = async () => {
    setBusy(true);
    try {
      const r = await online.request<{ ticket_no: string }>("/support/tickets", { method: "POST", body: { category: cat, message, email: email || null } });
      setResult({ ok: `Ticket ${r.ticket_no} created. We'll reply by email.` });
      setMessage("");
    } catch (e) {
      setResult({ err: (e as ApiErr).status === 0 ? "You're offline — try again when connected." : (e as ApiErr).message });
    }
    setBusy(false);
  };
  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined} testID="support-screen">
      <ScreenHeader title="Report a problem" testID="support-header" />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <View style={s.tabs}>
            {CATS.map((c) => (
              <Pressable key={c} onPress={() => setCat(c)} style={[s.tab, cat === c && s.tabOn]} testID={`support-cat-${c}`} accessibilityRole="radio" accessibilityState={{ selected: cat === c }}>
                <Text style={s.tabText}>{c[0].toUpperCase() + c.slice(1)}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={[s.input, { minHeight: 120, textAlignVertical: "top", paddingTop: 12 }]} multiline value={message} onChangeText={setMessage} placeholder="What happened?" placeholderTextColor="#8892A6" testID="support-message" accessibilityLabel="Describe the problem" />
          <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="Email for our reply (optional)" placeholderTextColor="#8892A6" autoCapitalize="none" keyboardType="email-address" testID="support-email" accessibilityLabel="Email" />
          {result.ok ? <Text style={s.ok} testID="support-ticket-created">{result.ok}</Text> : null}
          {result.err ? <Text style={s.error} testID="support-error">{result.err}</Text> : null}
          <PrimaryButton label="Send" variant="green" disabled={busy || message.trim().length < 5} onPress={send} testID="support-send" />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

import { useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { useAccount } from "@/src/online/AccountProvider";
import { online } from "@/src/online/online";
import { useOnlineStyles } from "@/src/online/styles";
import { useGame } from "@/src/state/GameProvider";
import { useTheme } from "@/src/theme";

import { sessionIdFrom } from "./account";

/** Web redirect target for Emergent Google sign-in (#session_id=…). */
export default function AuthCallback() {
  const s = useOnlineStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { linkProgress } = useAccount();
  const { showToast } = useGame();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const sid = typeof window !== "undefined" ? sessionIdFrom(window.location.href) : null;
    (async () => {
      try {
        if (!sid) throw new Error("missing session");
        await online.setSession(await online.request("/auth/google", { method: "POST", body: { session_id: sid }, auth: false }));
        const r = await linkProgress();
        if (typeof window !== "undefined") window.history.replaceState(null, "", "/auth-callback");
        showToast(r.conflict ? "Signed in — choose which progress to keep" : "Signed in with Google", "success");
      } catch {
        showToast("Sign-in failed. Check your details and try again.", "error");
      }
      router.replace("/account");
    })();
  }, [linkProgress, router, showToast]);
  return (
    <View style={[s.root, s.center]} testID="auth-callback">
      <ActivityIndicator color={colors.gold} />
      <Text style={s.muted}>Signing you in…</Text>
    </View>
  );
}

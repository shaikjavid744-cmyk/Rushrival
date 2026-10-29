import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/src/components/ui/PrimaryButton";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { useAccount } from "@/src/online/AccountProvider";
import { ApiErr, online } from "@/src/online/online";
import { useOnlineStyles } from "@/src/online/styles";
import { useGame } from "@/src/state/GameProvider";

type Mode = "signin" | "register" | "forgot" | "reset";
const AUTH_URL = "https://auth.emergentagent.com/";

export function sessionIdFrom(url: string): string | null {
  const m = url.match(/[#?&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function Account() {
  const s = useOnlineStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { save, showToast } = useGame();
  const { signedIn, user, linkProgress, signOut, syncStatus, pending, retrySync } = useAccount();
  const child = save.onboarding.childMode;
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [conflict, setConflict] = useState<any>(null);
  const [del, setDel] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg({});
    try {
      await fn();
    } catch (e) {
      setMsg({ err: (e as ApiErr).code === "invalid_credentials" ? "Sign-in failed. Check your details and try again." : ((e as ApiErr).message ?? "Service unavailable — try again") });
    } finally {
      setBusy(false);
    }
  };
  const afterSignIn = async (d: any) => {
    await online.setSession(d);
    const r = await linkProgress();
    if (r.conflict) setConflict(r.conflict);
    else {
      showToast("Signed in — progress saved to the cloud", "success");
      void online.flush();
    }
  };
  const submit = () =>
    run(async () => {
      if (mode === "signin") await afterSignIn(await online.request("/auth/login", { method: "POST", body: { email, password }, auth: false }));
      if (mode === "register") await afterSignIn(await online.request("/auth/register", { method: "POST", body: { email, password, name: save.name }, auth: false }));
      if (mode === "forgot") {
        await online.request("/auth/forgot-password", { method: "POST", body: { email }, auth: false });
        setMode("reset");
        setMsg({ ok: "If an account exists, we emailed a 6-digit code." });
      }
      if (mode === "reset") {
        await online.request("/auth/reset-password", { method: "POST", body: { email, code, new_password: password }, auth: false });
        setMode("signin");
        setMsg({ ok: "Password updated. Sign in with your new password." });
      }
    });
  const google = () =>
    run(async () => {
      const redirect = Platform.OS === "web" ? `${window.location.origin}/auth-callback` : Linking.createURL("auth-callback");
      const url = `${AUTH_URL}?redirect=${encodeURIComponent(redirect)}`;
      if (Platform.OS === "web") {
        window.location.href = url;
        return;
      }
      const res = await WebBrowser.openAuthSessionAsync(url, redirect);
      const sid = res.type === "success" ? sessionIdFrom(res.url) : null;
      if (!sid) throw { message: "Sign-in cancelled" };
      await afterSignIn(await online.request("/auth/google", { method: "POST", body: { session_id: sid }, auth: false }));
    });
  const choose = (choice: "cloud" | "device") =>
    run(async () => {
      await linkProgress(choice);
      setConflict(null);
      showToast(choice === "cloud" ? "Cloud progress loaded" : "Device progress saved to the cloud", "success");
    });
  const deleteAccount = () =>
    run(async () => {
      await online.request("/auth/delete-account", { method: "POST", body: { confirm: del } });
      await online.clearSession();
      showToast("Account deleted", "info");
      if (router.canDismiss()) router.dismissAll();
      router.replace("/menu");
    });

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined} testID="account-screen">
      <ScreenHeader title="Account" testID="account-header" />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        {msg.err ? <Text style={s.error} testID="account-error">{msg.err}</Text> : null}
        {msg.err && mode === "signin" && !signedIn ? (
          <PrimaryButton
            label="Continue as guest"
            variant="navy"
            onPress={() => {
              if (router.canDismiss()) router.dismissAll();
              router.replace("/menu");
            }}
            testID="account-continue-guest"
          />
        ) : null}
        {msg.ok ? <Text style={s.ok} testID="account-info">{msg.ok}</Text> : null}
        {conflict ? (
          <View style={s.card} testID="link-conflict-dialog">
            <Text style={s.title}>Which progress should we keep?</Text>
            <Text style={s.muted}>This account already has cloud progress. The other side will be replaced — nothing is added twice.</Text>
            <Text style={s.text} testID="link-conflict-cloud">Cloud: {conflict.cloud.coins} coins · {conflict.cloud.gems} gems · best {conflict.cloud.best_score}</Text>
            <Text style={s.text} testID="link-conflict-device">This device: {conflict.device.coins} coins · {conflict.device.gems} gems · best {conflict.device.best_score}</Text>
            <PrimaryButton label="Keep cloud progress" onPress={() => choose("cloud")} disabled={busy} testID="link-keep-cloud" />
            <PrimaryButton label="Keep this device" variant="navy" onPress={() => choose("device")} disabled={busy} testID="link-keep-device" />
          </View>
        ) : signedIn ? (
          <>
            <View style={s.card} testID="account-signed-in">
              <Text style={s.title}>{user?.name}</Text>
              <Text style={s.muted} testID="account-email">{user?.email}</Text>
              <Text style={s.text} testID="account-sync-status">Cloud save: {syncStatus === "failed" ? "sync failed" : pending ? `${pending} pending` : "up to date"}</Text>
              {syncStatus === "failed" ? <PrimaryButton label="Retry sync" onPress={retrySync} testID="account-retry-sync" /> : null}
              <PrimaryButton label="Sign out" variant="navy" onPress={signOut} testID="account-sign-out" />
            </View>
            <View style={s.card}>
              <Pressable onPress={() => setShowDelete((v) => !v)} testID="account-delete-toggle" accessibilityRole="button"><Text style={[s.link, { color: undefined }]}>Delete account…</Text></Pressable>
              {showDelete ? (
                <>
                  <Text style={s.muted}>This permanently deletes your account and cloud progress. Type DELETE to confirm.</Text>
                  <TextInput style={s.input} value={del} onChangeText={setDel} autoCapitalize="characters" placeholder="DELETE" placeholderTextColor="#8892A6" testID="account-delete-input" accessibilityLabel="Type DELETE to confirm" />
                  <PrimaryButton label="Delete my account" variant="red" disabled={del !== "DELETE" || busy} onPress={deleteAccount} testID="account-delete-confirm" />
                </>
              ) : null}
            </View>
          </>
        ) : (
          <View style={s.card}>
            {child ? <Text style={s.muted} testID="account-child-note">Creating accounts isn&apos;t available in child mode. Ask a parent to sign in.</Text> : null}
            <View style={s.tabs}>
              {(["signin", ...(child ? [] : ["register"])] as Mode[]).map((m) => (
                <Pressable key={m} style={[s.tab, (mode === m || (m === "signin" && (mode === "forgot" || mode === "reset"))) && s.tabOn]} onPress={() => setMode(m)} testID={`account-tab-${m}`} accessibilityRole="tab">
                  <Text style={s.tabText}>{m === "signin" ? "Sign in" : "Create account"}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.muted}>{mode === "forgot" ? "We'll email you a one-time code." : mode === "reset" ? "Enter the code from your email and a new password." : "Save progress to the cloud, compete on leaderboards and join events. Playing as a guest stays fully offline."}</Text>
            <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor="#8892A6" autoCapitalize="none" keyboardType="email-address" autoComplete="email" testID="account-email-input" accessibilityLabel="Email" />
            {mode === "reset" ? <TextInput style={s.input} value={code} onChangeText={setCode} placeholder="6-digit code" placeholderTextColor="#8892A6" keyboardType="number-pad" maxLength={6} testID="account-code-input" accessibilityLabel="Reset code" /> : null}
            {mode !== "forgot" ? <TextInput style={s.input} value={password} onChangeText={setPassword} placeholder={mode === "reset" ? "New password (8+ characters)" : "Password"} placeholderTextColor="#8892A6" secureTextEntry testID="account-password-input" accessibilityLabel="Password" /> : null}
            <PrimaryButton label={{ signin: "Sign in", register: "Create account", forgot: "Send code", reset: "Set new password" }[mode]} variant="green" onPress={submit} disabled={busy || !email} testID="account-submit" />
            {mode === "signin" ? <Pressable onPress={() => setMode("forgot")} testID="account-forgot" accessibilityRole="button"><Text style={s.link}>Forgot password?</Text></Pressable> : null}
            {!child ? <PrimaryButton label="Continue with Google" variant="navy" icon="logo-google" onPress={google} disabled={busy} testID="account-google" /> : null}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

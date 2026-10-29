import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeInRight } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/src/components/ui/PrimaryButton";
import { ToggleTile } from "@/src/components/ui/ToggleTile";
import { HERO_IMAGES, WELCOME_GIFT, WORLDS } from "@/src/config/catalog";
import { UI_IMAGES } from "@/src/game/sprites";
import { LANGUAGES, t } from "@/src/i18n";
import { requestNotificationPermission } from "@/src/services/notifications";
import { useGame } from "@/src/state/GameProvider";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const STEPS = ["welcome", "language", "age", "terms", "permissions", "intro", "name", "gift"] as const;
const INTRO: { title: string; body: string; image: number }[] = [
  { title: "A new runner rises…", body: "Rush hits the tracks with nothing but speed and style.", image: HERO_IMAGES.rush },
  { title: "New places…", body: "Race through the City, Beach, Snow, Night City, Temple and Lava worlds.", image: WORLDS[1].image },
  { title: "New rivals…", body: "Zoe, Kai, Shadow, Nova and Leo want your top spot.", image: HERO_IMAGES.shadow },
  { title: "Are you ready?", body: "Dodge trains, ride the roofs and grab every coin.", image: UI_IMAGES.logo },
];

export default function Onboarding() {
  const s = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { save, update, updateSettings, claimGift, showToast } = useGame();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(save.name === "Player" ? "" : save.name);
  const [agreed, setAgreed] = useState(false);
  const [notifDenied, setNotifDenied] = useState(false);
  const [panel, setPanel] = useState(0);
  const lang = save.settings.language;
  const next = () => setStep((n) => Math.min(STEPS.length - 1, n + 1));
  const cur = STEPS[step];

  const finish = () => {
    const fresh = !save.onboarding.giftClaimed && claimGift();
    update((d) => ({ ...d, onboarding: { ...d.onboarding, done: true } }));
    // REQ-55: the gift claim starts the interactive tutorial (toast shown after navigation so it survives the screen change).
    router.replace("/tutorial");
    if (fresh) setTimeout(() => showToast(`+${WELCOME_GIFT.coins} coins, +${WELCOME_GIFT.gems} gems, +${WELCOME_GIFT.hoverboards} hoverboards`, "success"), 400);
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined} testID="onboarding-screen">
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]} keyboardShouldPersistTaps="handled">
        <View style={s.dots} testID="onboarding-progress">
          {STEPS.map((k, i) => (
            <View key={k} style={[s.dot, i <= step && s.dotOn]} />
          ))}
        </View>
        <Animated.View key={cur} entering={FadeInRight.duration(260)} style={s.card} testID={`onboarding-step-${cur}`}>
          {cur === "welcome" ? (
            <>
              <Image source={UI_IMAGES.logo} style={s.logo} contentFit="contain" accessibilityLabel="Rush Rivals logo" />
              <Text style={s.title}>{t("welcome", lang)}</Text>
              <Text style={s.body}>{t("welcomeSub", lang)}</Text>
              <PrimaryButton label={t("continue", lang)} onPress={next} testID="onboarding-next-welcome" />
            </>
          ) : null}
          {cur === "language" ? (
            <>
              <Ionicons name="language" size={56} color={colors.accent} style={s.heroIcon} />
              <Text style={s.title}>{t("chooseLanguage", lang)}</Text>
              <View style={s.wrap}>
                {LANGUAGES.map((l) => (
                  <Pressable key={l.id} onPress={() => updateSettings({ language: l.id })} style={[s.chip, lang === l.id && s.chipOn]} testID={`onboarding-lang-${l.id}`} accessibilityRole="radio" accessibilityState={{ selected: lang === l.id }} aria-checked={lang === l.id}>
                    <Text style={s.chipText}>{l.label}</Text>
                  </Pressable>
                ))}
              </View>
              <PrimaryButton label={t("continue", lang)} onPress={next} testID="onboarding-next-language" />
            </>
          ) : null}
          {cur === "age" ? (
            <>
              <Ionicons name="shield-checkmark" size={56} color={colors.accent} style={s.heroIcon} />
              <Text style={s.title}>{t("ageTitle", lang)}</Text>
              <Text style={s.body}>{t("ageSub", lang)}</Text>
              <PrimaryButton label={t("under13", lang)} variant="navy" onPress={() => { update((d) => ({ ...d, onboarding: { ...d.onboarding, childMode: true } })); next(); }} testID="onboarding-age-under13" />
              <PrimaryButton label={t("over13", lang)} onPress={() => { update((d) => ({ ...d, onboarding: { ...d.onboarding, childMode: false } })); next(); }} testID="onboarding-age-over13" />
            </>
          ) : null}
          {cur === "terms" ? (
            <>
              <Ionicons name="document-text" size={56} color={colors.accent} style={s.heroIcon} />
              <Text style={s.title}>{t("termsTitle", lang)}</Text>
              <Text style={s.body}>{t("termsBody", lang)}</Text>
              <View style={s.linkRow}>
                <Text style={s.link} onPress={() => router.push("/legal/terms")} accessibilityRole="link" testID="onboarding-link-terms">Terms of Service</Text>
                <Text style={s.link} onPress={() => router.push("/legal/privacy")} accessibilityRole="link" testID="onboarding-link-privacy">Privacy Policy</Text>
              </View>
              <Pressable onPress={() => setAgreed((v) => !v)} style={s.check} testID="onboarding-terms-checkbox" accessibilityRole="checkbox" accessibilityState={{ checked: agreed }} aria-checked={agreed} accessibilityLabel="I agree to the Terms of Service and Privacy Policy">
                <Ionicons name={agreed ? "checkbox" : "square-outline"} size={28} color={agreed ? colors.success : colors.muted} />
                <Text style={s.checkText}>I agree to the Terms of Service and Privacy Policy</Text>
              </Pressable>
              <PrimaryButton label={t("continue", lang)} variant="green" disabled={!agreed} onPress={() => { update((d) => ({ ...d, onboarding: { ...d.onboarding, consent: true } })); next(); }} testID="onboarding-accept-terms" />
            </>
          ) : null}
          {cur === "permissions" ? (
            <>
              <Ionicons name="notifications" size={56} color={colors.accent} style={s.heroIcon} />
              <Text style={s.title}>Stay in the loop</Text>
              <Text style={s.body}>Both are optional. You can change them any time in Settings.</Text>
              <View style={s.permRow}>
                <ToggleTile
                  label="Notifications"
                  iconOn="notifications"
                  iconOff="notifications-off"
                  value={save.settings.notifications}
                  onChange={async (v) => {
                    if (!v) return updateSettings({ notifications: false });
                    const r = await requestNotificationPermission(); // OS prompt only when toggled on
                    updateSettings({ notifications: r === "granted" });
                    setNotifDenied(r !== "granted");
                  }}
                  testID="onboarding-toggle-notifications"
                />
                <ToggleTile label="Personalised ads" iconOn="person" iconOff="person-outline" value={!!save.settings.adPersonalisation} onChange={(v) => updateSettings({ adPersonalisation: v })} testID="onboarding-toggle-ads" />
              </View>
              <Text style={s.small}>Daily reward reminders and new events. Personalised ads use your activity to show more relevant ads.</Text>
              {notifDenied ? <Text style={s.warn} testID="onboarding-notif-denied">You can enable notifications later in Settings.</Text> : null}
              <PrimaryButton label={t("continue", lang)} onPress={next} testID="onboarding-next-permissions" />
            </>
          ) : null}
          {cur === "intro" ? (
            <>
              <Animated.View key={panel} entering={FadeInRight.duration(350)} style={s.introPanel} testID={`onboarding-intro-panel-${panel}`}>
                <Image source={INTRO[panel].image} style={s.introImg} contentFit={panel === 1 ? "cover" : "contain"} accessibilityLabel={INTRO[panel].title} />
                <Text style={s.title}>{INTRO[panel].title}</Text>
                <Text style={s.body}>{INTRO[panel].body}</Text>
              </Animated.View>
              <PrimaryButton label={panel < INTRO.length - 1 ? "Next" : "I'm ready!"} variant={panel < INTRO.length - 1 ? "navy" : "gold"} onPress={() => (panel < INTRO.length - 1 ? setPanel(panel + 1) : next())} testID="onboarding-intro-next" />
              <Pressable onPress={next} style={s.skip} testID="onboarding-intro-skip" accessibilityRole="button" accessibilityLabel="Skip intro">
                <Text style={s.skipText}>Skip intro</Text>
              </Pressable>
            </>
          ) : null}
          {cur === "name" ? (
            <>
              <Ionicons name="person-circle" size={56} color={colors.accent} style={s.heroIcon} />
              <Text style={s.title}>{t("nameTitle", lang)}</Text>
              <TextInput
                value={name}
                onChangeText={(v) => setName(v.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 16))}
                placeholder="Runner"
                placeholderTextColor={colors.muted}
                style={s.input}
                maxLength={16}
                returnKeyType="done"
                testID="onboarding-name-input"
                accessibilityLabel="Runner name"
              />
              <PrimaryButton label={t("continue", lang)} onPress={() => { const n = name.trim() || "Runner"; update((d) => ({ ...d, name: n })); next(); }} testID="onboarding-next-name" />
            </>
          ) : null}
          {cur === "gift" ? (
            <>
              <Ionicons name="gift" size={64} color={colors.gold} style={s.heroIcon} />
              <Text style={s.title}>{t("giftTitle", lang)}</Text>
              <View style={s.giftRow}>
                <View style={s.giftTile}><Image source={UI_IMAGES.coin} style={{ width: 36, height: 36 }} /><Text style={s.giftAmt}>{WELCOME_GIFT.coins}</Text></View>
                <View style={s.giftTile}><Ionicons name="diamond" size={34} color={colors.gem} /><Text style={s.giftAmt}>{WELCOME_GIFT.gems}</Text></View>
                <View style={s.giftTile}><Ionicons name="albums" size={34} color={colors.accent} /><Text style={s.giftAmt}>x{WELCOME_GIFT.hoverboards}</Text></View>
              </View>
              <PrimaryButton label={save.onboarding.giftClaimed ? t("letsGo", lang) : t("claim", lang)} variant="gold" size="xl" heavyHaptic onPress={finish} testID="onboarding-claim-gift" />
            </>
          ) : null}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { flexGrow: 1, paddingHorizontal: spacing.lg, justifyContent: "center", gap: spacing.lg },
  dots: { flexDirection: "row", gap: 6, justifyContent: "center" },
  dot: { width: 28, height: 6, borderRadius: 3, backgroundColor: c.surfaceSecondary },
  dotOn: { backgroundColor: c.accent },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 2, borderColor: c.brandPrimary, padding: spacing.lg, gap: spacing.md, alignItems: "stretch" },
  heroIcon: { alignSelf: "center" },
  logo: { width: "100%", height: 150 },
  title: { fontFamily: fonts.display, fontSize: 28, color: c.onSurface, textAlign: "center" },
  body: { fontFamily: fonts.body, fontSize: 15, color: c.onSurfaceSecondary, textAlign: "center", lineHeight: 21 },
  label: { fontFamily: fonts.bodyHeavy, fontSize: 13, color: c.muted, textAlign: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "center" },
  chip: { height: 40, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 2, borderColor: c.border, justifyContent: "center", backgroundColor: c.surface },
  chipOn: { borderColor: c.accent, backgroundColor: c.surfaceTertiary },
  chipText: { fontFamily: fonts.bodyHeavy, color: c.onSurface },
  input: { height: 52, borderRadius: radius.md, borderWidth: 2, borderColor: c.brandPrimary, backgroundColor: c.surface, color: c.onSurface, paddingHorizontal: spacing.md, fontFamily: fonts.bodyHeavy, fontSize: 18 },
  howRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  linkRow: { flexDirection: "row", justifyContent: "center", gap: spacing.lg },
  link: { fontFamily: fonts.bodyHeavy, fontSize: 14, color: c.accent, textDecorationLine: "underline", paddingVertical: spacing.xs },
  check: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: c.surface },
  checkText: { flex: 1, fontFamily: fonts.bodyHeavy, fontSize: 14, color: c.onSurface },
  permRow: { flexDirection: "row", gap: spacing.sm },
  small: { fontFamily: fonts.body, fontSize: 12, color: c.muted, textAlign: "center", lineHeight: 17 },
  warn: { fontFamily: fonts.bodyHeavy, fontSize: 13, color: c.warning, textAlign: "center" },
  introPanel: { alignItems: "center", gap: spacing.sm },
  introImg: { width: "100%", height: 220, borderRadius: radius.md },
  skip: { alignSelf: "center", minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md },
  skipText: { fontFamily: fonts.bodyHeavy, fontSize: 14, color: c.muted, textDecorationLine: "underline" },
  howIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
  howText: { flex: 1, fontFamily: fonts.bodyHeavy, fontSize: 14, color: c.onSurface },
  giftRow: { flexDirection: "row", gap: spacing.sm, justifyContent: "center" },
  giftTile: { flex: 1, alignItems: "center", backgroundColor: c.surface, borderRadius: radius.md, padding: spacing.sm, gap: 4 },
  giftAmt: { fontFamily: fonts.display, fontSize: 20, color: c.gold },
}));

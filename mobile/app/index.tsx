import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorPanel } from "@/src/components/ui/ErrorPanel";
import { UI_IMAGES } from "@/src/game/sprites";
import { deviceKV } from "@/src/save/deviceKV";
import { corruptSave, LoadStatus } from "@/src/save/saveManager";
import { preloadAssets } from "@/src/services/assets";
import { audio } from "@/src/services/audio";
import { initSkia } from "@/src/services/skiaInit";
import { useGame } from "@/src/state/GameProvider";
import { fonts, makeStyles, radius, spacing } from "@/src/theme";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let devFailConsumed = false;

function webFlag(name: string): boolean {
  return __DEV__ && Platform.OS === "web" && typeof window !== "undefined" && new URLSearchParams(window.location.search).get(name) === "1";
}

function stripWebFlag(name: string) {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete(name);
  window.history.replaceState(null, "", url.toString());
}

export default function SplashRoute() {
  const s = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { init, showToast } = useGame();
  const [phase, setPhase] = useState<"loading" | "brand" | "error">("loading");
  const [error, setError] = useState("");
  const progress = useSharedValue(0);
  const alive = useRef(true);

  const run = useCallback(async () => {
    setPhase("loading");
    progress.value = withTiming(0.08, { duration: 200 });
    try {
      if (webFlag("devFailInit") && !devFailConsumed) {
        devFailConsumed = true;
        throw new Error("Simulated initialization failure (dev flag devFailInit=1).");
      }
      if (webFlag("devCorruptSave")) {
        await corruptSave(deviceKV);
        stripWebFlag("devCorruptSave");
      }
      let status = "new" as LoadStatus;
      const steps: (() => Promise<unknown>)[] = [
        initSkia,
        preloadAssets,
        () => audio.init(),
        async () => {
          status = await init();
        },
      ];
      const minShow = wait(1100);
      for (let i = 0; i < steps.length; i++) {
        await steps[i]();
        progress.value = withTiming((i + 1) / steps.length, { duration: 250 });
      }
      await minShow;
      if (!alive.current) return;
      setPhase("brand");
      await wait(1500);
      if (!alive.current) return;
      router.replace("/menu");
      if (status === "reset") setTimeout(() => showToast("Save data was reset", "warning"), 350);
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof Error ? e.message : "Could not load game data.");
      setPhase("error");
    }
  }, [init, progress, router, showToast]);

  useEffect(() => {
    alive.current = true;
    run();
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bar = useAnimatedStyle(() => ({ width: `${Math.round(progress.value * 100)}%` }));

  if (phase === "brand") {
    return (
      <View style={s.root} testID="brand-screen">
        <Animated.View entering={ZoomIn.springify().damping(14)} style={s.center}>
          <Image source={UI_IMAGES.velactra} style={s.vLogo} contentFit="contain" accessibilityLabel="Velactra logo" />
        </Animated.View>
        <Animated.Text entering={FadeIn.delay(250).duration(400)} style={s.studio}>
          VELACTRA
        </Animated.Text>
        <Animated.Text entering={FadeIn.delay(450).duration(400)} style={s.studioSub}>
          GAME STUDIO
        </Animated.Text>
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]} testID="splash-screen">
      {phase === "error" ? (
        <View style={s.errorWrap}>
          <ErrorPanel title="Couldn't start the game" message={error} onRetry={run} testID="init-error-panel" />
        </View>
      ) : (
        <>
          <Animated.View entering={ZoomIn.springify().damping(12)} style={s.center}>
            <Image source={UI_IMAGES.logo} style={s.logo} contentFit="contain" accessibilityLabel="Rush Rivals logo" />
          </Animated.View>
          <View style={s.loader}>
            <View style={s.track} testID="splash-loading-bar">
              <Animated.View style={[s.fill, bar]} />
            </View>
            <Text style={s.loadingText}>Loading...</Text>
          </View>
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  center: { alignItems: "center", justifyContent: "center" },
  logo: { width: 320, height: 210, maxWidth: "100%" },
  vLogo: { width: 150, height: 130 },
  studio: { fontFamily: fonts.display, fontSize: 40, color: c.onSurface, letterSpacing: 6, marginTop: spacing.lg },
  studioSub: { fontFamily: fonts.bodyHeavy, fontSize: 14, color: c.accent, letterSpacing: 6, marginTop: spacing.xs },
  loader: { width: "80%", maxWidth: 320, marginTop: spacing["2xl"], alignItems: "center" },
  track: {
    width: "100%",
    height: 16,
    backgroundColor: c.surfaceSecondary,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: c.border,
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: c.gold, borderRadius: radius.pill },
  loadingText: { fontFamily: fonts.bodyHeavy, color: c.muted, marginTop: spacing.sm, fontSize: 14 },
  errorWrap: { width: "100%", alignItems: "center" },
}));

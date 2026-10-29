import { Canvas, Picture, Skia, SkPicture } from "@shopify/react-native-skia";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConfirmationDialog } from "@/src/components/ui/ConfirmationDialog";
import { LoadingOverlay } from "@/src/components/ui/LoadingOverlay";
import { PauseMenu } from "@/src/components/ui/PauseMenu";
import { useBackAction } from "@/src/hooks/useBackAction";
import { audio } from "@/src/services/audio";
import { haptics } from "@/src/services/haptics";
import { useGame } from "@/src/state/GameProvider";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { EmptyState } from "@/src/components/ui/EmptyState";

import { TUNING } from "./constants";
import { GameEngine, GameEvent } from "./engine";
import type { Action } from "./player";
import { makeViewport } from "./projection";
import { Renderer, Sprites } from "./renderer";
import { SPRITE_SOURCES } from "./sprites";
import { useCachedImage } from "./imageCache";
import { online } from "@/src/online/online";
import { monStore } from "@/src/monetization/store";
import { ads } from "@/src/services/ads";
import { analytics } from "@/src/services/analytics";

const AD_REVIVES_PER_RUN = 1;
import { activeEventWorld } from "@/src/online/events";
import { BOARDS, CHARACTERS, POWERUP_IMAGES, REVIVE_GEMS, WORLDS } from "@/src/config/catalog";
import { CountdownOverlay, RESUME_STEPS, START_STEPS } from "./ui/CountdownOverlay";
import { GameOverPanel, RunSummary } from "./ui/GameOverPanel";
import { RevivePanel } from "./ui/RevivePanel";
import { TutorialController, TutorialStep } from "./tutorial";
import { TutorialDonePanel, TutorialHint } from "./ui/TutorialHint";
import { Hud } from "./ui/Hud";
import { TouchControls } from "./ui/TouchControls";
import { Run3DView } from "./three/Run3DView";
import type { ThreeRenderer } from "./three/ThreeRenderer";

type Phase = "countdown" | "running" | "paused" | "resumeCountdown" | "crashed" | "revive" | "over" | "tutorialDone";

const SWIPE_DIST = 26;
const CRASH_TO_SUMMARY_MS = 900;

function useSprites(equipped: { character: string; board: string; world: string }): Sprites | null {
  const board = useCachedImage(BOARDS.find((b) => b.id === equipped.board)?.image ?? BOARDS[0].image);
  const magnet = useCachedImage(POWERUP_IMAGES.magnet);
  const shield = useCachedImage(POWERUP_IMAGES.shield);
  const speed = useCachedImage(POWERUP_IMAGES.speed);
  const x2 = useCachedImage(POWERUP_IMAGES.x2);
  const coin = useCachedImage(SPRITE_SOURCES.coin);
  const low = useCachedImage(SPRITE_SOURCES.low);
  const high = useCachedImage(SPRITE_SOURCES.high);
  const train = useCachedImage(SPRITE_SOURCES.train);
  const bg = useCachedImage(WORLDS.find((w) => w.id === equipped.world)?.image ?? SPRITE_SOURCES.bg);
  return useMemo(() => {
    if (!coin || !low || !high || !train || !bg || !board || !magnet || !shield || !speed || !x2) return null;
    return { coin, low, high, train, bg, board, pickups: { magnet, shield, speed, x2, hoverboard: board } };
  }, [coin, low, high, train, bg, board, magnet, shield, speed, x2]);
}

function emptyPicture(): SkPicture {
  const rec = Skia.PictureRecorder();
  rec.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
  return rec.finishRecordingAsPicture();
}

export interface RunScreenProps {
  tutorial?: boolean;
  onTutorialExit?: (completed: boolean) => void;
}

export default function RunScreen({ tutorial = false, onTutorialExit }: RunScreenProps = {}) {
  const s = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { save, bankRun, showToast, consumeHoverboard, spend, applyGrant } = useGame();
  const sprites = useSprites(save.equipped);
  const [timers, setTimers] = useState<Record<string, number>>({});

  const engineRef = useRef<GameEngine | null>(null);
  if (!engineRef.current) engineRef.current = tutorial ? new GameEngine(7, { autoSpawn: false, powerups: false }) : new GameEngine();
  const tutRef = useRef<TutorialController | null>(null);
  if (tutorial && !tutRef.current) tutRef.current = new TutorialController();
  const [tutHint, setTutHint] = useState<TutorialStep | null>(null);
  const tutHintRef = useRef<TutorialStep | null>(null);
  const frozenRef = useRef(false); // dev-only freeze (deterministic pose screenshots)

  const [phase, setPhaseState] = useState<Phase>("countdown");
  const phaseRef = useRef<Phase>("countdown");
  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);
  const [countKey, setCountKey] = useState(0);
  const [confirm, setConfirm] = useState<null | "restart" | "home">(null);
  const [hud, setHud] = useState({ score: 0, coins: 0, distance: 0 });
  const [fps, setFps] = useState(0);
  const [summary, setSummary] = useState<RunSummary | null>(null);

  const picture = useSharedValue<SkPicture>(emptyPicture());
  const vp = useMemo(() => makeViewport(width, height), [width, height]);
  const vpRef = useRef(vp);
  vpRef.current = vp;
  const dirtyRef = useRef(true);
  // 3D (three.js via expo-gl) is the primary renderer; Skia 2D is the automatic fallback.
  const threeRef = useRef<ThreeRenderer | null>(null);
  const gl3dCycles = useRef({ suspended: 0, ready: 0 });
  const [render3d, setRender3d] = useState<"pending" | "ready" | "failed">("pending");
  const look3d = (CHARACTERS.find((c) => c.id === save.equipped.character) ?? CHARACTERS[0]).rig!;
  const palette3d = (WORLDS.find((w) => w.id === save.equipped.world) ?? WORLDS[0]).palette;
  const on3dReady = useCallback((r: ThreeRenderer) => {
    threeRef.current = r;
    gl3dCycles.current.ready += 1;
    dirtyRef.current = true;
    setRender3d("ready");
  }, []);
  const on3dSuspend = useCallback(() => {
    threeRef.current = null; // GL released (background / low memory) — the frame loop skips 3D until onReady again
    gl3dCycles.current.suspended += 1;
  }, []);
  const on3dFail = useCallback((reason: string) => {
    if (__DEV__) console.warn("[run] 3D renderer unavailable, using Skia 2D fallback:", reason);
    threeRef.current = null;
    setRender3d("failed");
  }, []);
  // Skia's web backend (CanvasKit) also needs WebGL; with no WebGL at all show a message instead of crashing.
  const noGL = useMemo(() => {
    if (Platform.OS !== "web" || render3d !== "failed") return false;
    try {
      const c = document.createElement("canvas");
      return !(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      return true;
    }
  }, [render3d]);
  useEffect(() => {
    if (noGL) frozenRef.current = true; // nothing can be drawn: hold the simulation
  }, [noGL]);
  // First run of this screen (Play from the menu) also gets a server run token; restarts go through startRun().
  useEffect(() => {
    if (!tutorial && engineRef.current) {
      online.startRun(engineRef.current.runId, save.equipped.world);
      analytics.event("run_start", { world: save.equipped.world });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { colors } = useTheme();
  const crashAtRef = useRef(0);
  const gemRevivesRef = useRef(0);
  const adRevivesRef = useRef(0);
  const bankedRunRef = useRef<string | null>(null);

  useEffect(() => {
    dirtyRef.current = true;
  }, [vp]);

  // ---- events → sound / haptics --------------------------------------------
  const handleEvents = useCallback((events: GameEvent[]) => {
    for (const ev of events) {
      switch (ev) {
        case "lane":
          audio.play("lane");
          haptics.selection();
          break;
        case "jump":
          audio.play("jump");
          haptics.light();
          break;
        case "slide":
          audio.play("slide");
          haptics.light();
          break;
        case "coin":
          audio.play("coin");
          haptics.light();
          break;
        case "powerup":
          audio.play("best");
          haptics.medium();
          break;
        case "shieldBreak":
        case "boardBreak":
          audio.play("crash");
          haptics.heavy();
          break;
        case "crash":
          audio.play("crash");
          haptics.error();
          break;
      }
    }
  }, []);

  // ---- run lifecycle ---------------------------------------------------------
  const finishRun = useCallback(() => {
    const e = engineRef.current!;
    if (bankedRunRef.current === e.runId) return;
    bankedRunRef.current = e.runId;
    const distance = Math.floor(e.distance);
    const outcome = bankRun({ runId: e.runId, coins: e.coinsCollected, score: e.score, distance, powerupsUsed: e.powerupsUsed });
    if (!tutorial) {
      ads.recordRunCompleted();
      analytics.event("run_end", { score: e.score, coins: e.coinsCollected, distance });
      if (outcome.levelUp) analytics.event("level_up", { level: outcome.levelUp });
      const world = save.equipped.world;
      const ev = activeEventWorld();
      online.recordRun(e.runId, { duration: e.time, distance: e.distance, coins: e.coinsCollected, score: e.score, powerupsUsed: e.powerupsUsed, revives: e.revives, world, eventTokens: ev === world ? e.coinsCollected : 0 });
    }
    if (outcome.levelUp) setTimeout(() => showToast(`Level up! You reached Lv ${outcome.levelUp}`, "success"), 600);
    setSummary({ score: e.score, coins: e.coinsCollected, distance, newBest: outcome.newBest });
    setHud({ score: e.score, coins: e.coinsCollected, distance });
    if (outcome.newBest) {
      audio.play("best");
      haptics.success();
    }
    setPhase("over");
  }, [bankRun, setPhase, showToast, tutorial, save.equipped.world]);
  // After the crash animation: offer a revive (max REVIVE_GEMS.length per run), else finish.
  const afterCrash = useCallback(() => {
    const e = engineRef.current!;
    const canRevive = tutorial ? e.revives < REVIVE_GEMS.length : gemRevivesRef.current < REVIVE_GEMS.length || adRevivesRef.current < AD_REVIVES_PER_RUN;
    if (canRevive) setPhase("revive");
    else finishRun();
  }, [finishRun, setPhase, tutorial]);
  const afterCrashRef = useRef(afterCrash);
  afterCrashRef.current = afterCrash;

  const doRevive = useCallback(() => {
    const e = engineRef.current!;
    const n = gemRevivesRef.current;
    const cost = REVIVE_GEMS[n];
    if (cost === undefined || !spend(`revive:${e.runId}:${n}`, "gems", cost, "revive")) return;
    gemRevivesRef.current = n + 1;
    e.revive();
    dirtyRef.current = true;
    showToast(`Revived! −${cost} gems`, "success");
    setCountKey((k) => k + 1);
    setPhase("resumeCountdown");
  }, [setPhase, showToast, spend]);

  // ---- rewarded ads (Phase 4): grant only on "earned", once per reward event id ---------------
  const [adBusy, setAdBusy] = useState(false);
  const [adCoins, setAdCoins] = useState<"idle" | "loading" | "claimed">("idle");
  const [adUnavailable, setAdUnavailable] = useState<null | (() => void)>(null);
  const adOutcome = useCallback(
    async (placement: "revive" | "double_coins", retry: () => void) => {
      setAdBusy(true);
      const out = await ads.showRewarded(placement);
      setAdBusy(false);
      if (out === "closed_early") showToast("Watch the full video to get the reward", "info");
      else if (out !== "earned") setAdUnavailable(() => retry);
      return out === "earned";
    },
    [showToast],
  );

  const doAdRevive = useCallback(async () => {
    const e = engineRef.current!;
    if (adRevivesRef.current >= AD_REVIVES_PER_RUN) return;
    if (!(await adOutcome("revive", () => void doAdReviveRef.current()))) return;
    const eventId = `adrev:${e.runId}`;
    if (!monStore.markGranted(eventId)) return;
    adRevivesRef.current += 1;
    if (online.signedIn) void online.enqueue("/ads/reward", { placement: "revive", event_id: eventId, run_id: e.runId });
    e.revive();
    dirtyRef.current = true;
    showToast("Revived!", "success");
    setCountKey((k) => k + 1);
    setPhase("resumeCountdown");
  }, [adOutcome, setPhase, showToast]);
  const doAdReviveRef = useRef(doAdRevive);
  doAdReviveRef.current = doAdRevive;

  const doDoubleCoins = useCallback(async () => {
    const e = engineRef.current!;
    const eventId = `addbl:${e.runId}`;
    if (monStore.get().granted.includes(eventId)) {
      setAdCoins("claimed");
      showToast("Reward already claimed", "info");
      return;
    }
    setAdCoins("loading");
    const ok = await adOutcome("double_coins", () => void doDoubleRef.current());
    if (!ok || !monStore.markGranted(eventId)) {
      setAdCoins(monStore.get().granted.includes(eventId) ? "claimed" : "idle");
      return;
    }
    applyGrant(eventId, { coins: e.coinsCollected }, "ad_double_coins");
    if (online.signedIn) void online.enqueue("/ads/reward", { placement: "double_coins", event_id: eventId, run_id: online.runRef(e.runId) });
    setSummary((sm) => (sm ? { ...sm, coins: sm.coins * 2 } : sm));
    setAdCoins("claimed");
    showToast(`Coins doubled! +${e.coinsCollected}`, "success");
  }, [adOutcome, applyGrant, showToast]);
  const doDoubleRef = useRef(doDoubleCoins);
  doDoubleRef.current = doDoubleCoins;

  /** Between completed runs only: maybe an interstitial (caps + Remove Ads enforced in ads.maybeShowInterstitial). */
  const betweenRuns = useCallback(
    async (next: () => void) => {
      if (!tutorial) await ads.maybeShowInterstitial();
      next();
    },
    [tutorial],
  );

  const startRun = useCallback(() => {
    // Abandoned/previous run is discarded without banking (bank happens only in finishRun).
    engineRef.current!.reset();
    gemRevivesRef.current = 0;
    adRevivesRef.current = 0;
    setAdCoins("idle");
    if (!tutorial) {
      online.startRun(engineRef.current!.runId, save.equipped.world);
      analytics.event("run_start", { world: save.equipped.world });
    }
    if (tutorial) {
      tutRef.current = new TutorialController();
      tutHintRef.current = null;
      setTutHint(null);
    }
    dirtyRef.current = true;
    setSummary(null);
    setConfirm(null);
    setHud({ score: 0, coins: 0, distance: 0 });
    setCountKey((k) => k + 1);
    setPhase("countdown");
  }, [setPhase, tutorial, save.equipped.world]);

  const pause = useCallback(() => {
    const p = phaseRef.current;
    if (p === "running" || p === "countdown" || p === "resumeCountdown") {
      setConfirm(null);
      setPhase("paused");
    }
  }, [setPhase]);

  const resume = useCallback(() => {
    setCountKey((k) => k + 1);
    setPhase("resumeCountdown");
  }, [setPhase]);

  const goHome = useCallback(() => (tutorial ? onTutorialExit?.(false) : router.replace("/menu")), [router, tutorial, onTutorialExit]);

  const onCountdownDone = useCallback(() => {
    const t = tutRef.current;
    if (t && t.index === -1 && !t.waiting) t.start(engineRef.current!);
    setPhase("running");
  }, [setPhase]);

  const doInput = useCallback(
    (a: Action) => {
      if (phaseRef.current !== "running") return;
      const e = engineRef.current!;
      // Tutorial: only the hinted action is accepted, and only while its hint is showing.
      if (tutRef.current && !tutRef.current.accept(a, e)) return;
      e.input(a);
      handleEvents(e.drainEvents());
    },
    [handleEvents],
  );
  const inputRef = useRef(doInput);
  inputRef.current = doInput;

  // ---- main loop (JS thread rAF → Skia picture shared value) -----------------
  useEffect(() => {
    if (!sprites) return;
    const world = WORLDS.find((w) => w.id === save.equipped.world) ?? WORLDS[0];
    const look = (CHARACTERS.find((c) => c.id === save.equipped.character) ?? CHARACTERS[0]).rig!;
    const renderer = new Renderer(sprites, world.palette, save.settings.graphics, look);
    let raf = 0;
    let last = performance.now();
    let hudAt = 0;
    let fpsAt = last;
    let frames = 0;

    const frame = (now: number) => {
      const e = engineRef.current!;
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const ph = phaseRef.current;
      let fx = { shake: 0, flash: 0, crashT: 0 };

      if (ph === "running") {
        const tut = tutRef.current;
        if (!tut?.waiting && !frozenRef.current) e.update(dt);
        if (tut) {
          tut.tick(e);
          const hint = tut.waiting ? tut.step : null;
          if (hint !== tutHintRef.current) {
            tutHintRef.current = hint;
            setTutHint(hint);
          }
          if (tut.done) {
            phaseRef.current = "tutorialDone";
            setPhaseState("tutorialDone");
          }
        }
        const evs = e.drainEvents();
        if (evs.length) handleEvents(evs);
        if (e.crashed) {
          crashAtRef.current = now;
          phaseRef.current = "crashed";
          setPhaseState("crashed");
        }
      }
      const animating = phaseRef.current === "crashed";
      if (animating) {
        const t = now - crashAtRef.current;
        fx = { shake: Math.max(0, 1 - t / 450) * 12, flash: Math.max(0, 0.45 - t / 700), crashT: Math.min(1, t / 400) };
        if (t > CRASH_TO_SUMMARY_MS) {
          phaseRef.current = "revive";
          afterCrashRef.current();
        }
      }

      if (ph === "running" || animating || dirtyRef.current) {
        dirtyRef.current = false;
        const v = vpRef.current;
        if (threeRef.current) threeRef.current.render(e, fx);
        else {
          const rec = Skia.PictureRecorder();
          const canvas = rec.beginRecording(Skia.XYWHRect(0, 0, v.width, v.height));
          renderer.draw(canvas, e, v, fx);
          picture.value = rec.finishRecordingAsPicture();
        }
      }

      if (ph === "running" && now - hudAt > 100) {
        hudAt = now;
        const d = Math.floor(e.distance);
        setTimers({ ...e.timers });
        setHud((h) => (h.score === e.score && h.coins === e.coinsCollected && h.distance === d ? h : { score: e.score, coins: e.coinsCollected, distance: d }));
      }
      frames++;
      if (__DEV__ && now - fpsAt >= 500) {
        setFps(Math.round((frames * 1000) / (now - fpsAt)));
        frames = 0;
        fpsAt = now;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprites, handleEvents, picture]);

  // ---- auto-pause on background ---------------------------------------------
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st !== "active") pause();
    });
    const mem = AppState.addEventListener("memoryWarning", () => pause()); // undefined on web
    return () => {
      sub.remove();
      mem?.remove();
    };
  }, [pause]);

  // ---- Android back (and Escape on web dev) ---------------------------------
  useBackAction(() => {
    const p = phaseRef.current;
    if (p === "running" || p === "countdown" || p === "resumeCountdown") pause();
    else if (p === "paused" && confirm) setConfirm(null);
    else if (p === "paused") resume();
    else if (p === "revive") finishRun();
    else if (p === "over") goHome();
  });

  // ---- keyboard (web preview) -----------------------------------------------
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const map: Record<string, Action> = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
      a: "left",
      d: "right",
      w: "up",
      s: "down",
    };
    const onKey = (ev: KeyboardEvent) => {
      const a = map[ev.key];
      if (a) {
        ev.preventDefault();
        inputRef.current(a);
      } else if (ev.key === "p" || ev.key === "P") pause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pause]);

  // ---- dev-only debug handle for automated web testing ----------------------
  useEffect(() => {
    if (!__DEV__ || Platform.OS !== "web") return;
    (globalThis as any).__RR_DEBUG__ = {
      get gl() {
        return { ...gl3dCycles.current, live: !!threeRef.current };
      },
      get state() {
        const e = engineRef.current!;
        return {
          phase: phaseRef.current,
          lane: e.player.lane,
          x: e.player.x,
          y: e.player.y,
          airborne: e.player.airborne,
          sliding: e.player.sliding,
          distance: e.distance,
          speed: e.speed,
          coins: e.coinsCollected,
          score: e.score,
          runId: e.runId,
        };
      },
      // Dev-only: raw engine handle for automated inspection (obstacles/rows).
      get engine() {
        return engineRef.current;
      },
      // Dev-only: drop n coins just ahead in the runner's lane (exercises the real pickup path).
      placeCoinsAhead(n = 3) {
        const e = engineRef.current!;
        for (let i = 0; i < n; i++) e.addCoin(e.player.lane, e.distance + 4 + i * 1.5);
      },
      // Dev-only: invulnerable runner (screenshots / automated checks).
      setGodMode(on = true) {
        engineRef.current!.godMode = on;
      },
      // Dev-only: stop simulation updates (rendering continues) to inspect a pose.
      freeze(on = true) {
        frozenRef.current = on;
      },
      // Dev-only: clear the runner's lane and place a ramp train ahead (roof-route verification).
      placeTrainAhead() {
        const e = engineRef.current!;
        const lane = e.player.lane;
        for (const o of e.obstacles.items) if (o.active && o.lane === lane && o.z > e.distance && o.z < e.distance + 90) o.active = false;
        const z = e.distance + 12 + TUNING.rampLength;
        e.addObstacle("train", lane, z, { ramp: true });
        for (let i = 0; i < 8; i++) e.addCoin(lane, z + 2 + i * 1.6, TUNING.trainHeight + 0.6);
      },
      // Dev-only: obstacle showcase for screenshots (parked train, ramp train, overhead slide-under gantry).
      placeShowcase() {
        const e = engineRef.current!;
        for (const o of e.obstacles.items) if (o.active && o.z > e.distance && o.z < e.distance + 60) o.active = false;
        e.addObstacle("train", -1, e.distance + 16);
        e.addObstacle("train", 1, e.distance + 15 + TUNING.rampLength, { ramp: true });
        e.addObstacle("high", 0, e.distance + 12);
      },
    };
    return () => {
      delete (globalThis as any).__RR_DEBUG__;
    };
  }, []);

  // ---- swipe gestures --------------------------------------------------------
  const fired = useRef(false);
  const pan = usePanGesture({
    runOnJS: true,
    minDistance: 6,
    onBegin: () => {
      fired.current = false;
    },
    onUpdate: (e) => {
      if (fired.current) return;
      const tx = e.translationX;
      const ty = e.translationY;
      if (Math.max(Math.abs(tx), Math.abs(ty)) < SWIPE_DIST) return;
      fired.current = true;
      inputRef.current(Math.abs(tx) > Math.abs(ty) ? (tx > 0 ? "right" : "left") : ty < 0 ? "up" : "down");
    },
    onFinalize: () => {
      fired.current = false;
    },
  });
  // Double-tap anywhere on the track: ride a hoverboard from inventory.
  const lastTap = useRef(0);
  const onTrackTap = useCallback(() => {
    const t = Date.now();
    if (!tutorial && t - lastTap.current < 300 && phaseRef.current === "running" && engineRef.current!.timers.hoverboard <= 0 && consumeHoverboard()) {
      engineRef.current!.activatePowerUp("hoverboard");
      handleEvents(engineRef.current!.drainEvents());
    }
    lastTap.current = t;
  }, [consumeHoverboard, handleEvents, tutorial]);

  const showControls = save.settings.accessibilityButtons && (phase === "running" || phase === "countdown" || phase === "resumeCountdown");

  return (
    <View style={s.root} testID="run-screen">
      <GestureDetector gesture={pan}>
        <View style={StyleSheet.absoluteFill} testID="run-gesture-area" accessibilityLabel="Swipe to move, jump and slide" onTouchEnd={onTrackTap}>
          {render3d !== "failed" ? (
            <Run3DView width={width} height={height} look={look3d} palette={palette3d} worldId={save.equipped.world} graphics={save.settings.graphics} onReady={on3dReady} onFail={on3dFail} onSuspend={on3dSuspend} />
          ) : null}
          {sprites && render3d !== "ready" && !noGL ? (
            <Canvas style={StyleSheet.absoluteFill} testID="run-2d-canvas">
              <Picture picture={picture} />
            </Canvas>
          ) : null}
        </View>
      </GestureDetector>

      {noGL ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, justifyContent: "center", padding: 24 }]} testID="run-no-graphics">
          <EmptyState icon="alert-circle" title="Graphics not supported" message="This browser has WebGL turned off, so the run can't be drawn. Try another browser or the mobile app." testID="run-no-graphics-message" />
          <Pressable onPress={goHome} testID="run-no-graphics-home" accessibilityRole="button" accessibilityLabel="Back to menu" style={{ alignSelf: "center", minHeight: 48, paddingHorizontal: 24, justifyContent: "center", borderRadius: 12, backgroundColor: colors.brandPrimary }}>
            <Text style={{ color: colors.onBrandPrimary, fontFamily: fonts.bodyHeavy, fontSize: 16 }}>Back to menu</Text>
          </Pressable>
        </View>
      ) : null}

      {sprites && !noGL ? (
        <>
          <Hud
            score={hud.score}
            coins={hud.coins}
            distance={hud.distance}
            fps={__DEV__ ? fps : null}
            timers={timers}
            multiplier={timers.x2 > 0 ? 2 : 1}
            hoverboards={tutorial ? 0 : save.hoverboards}
            onPause={pause}
            pauseEnabled={phase === "running" || phase === "countdown" || phase === "resumeCountdown"}
          />
          {showControls ? <TouchControls onAction={doInput} /> : null}
          {phase === "countdown" ? <CountdownOverlay key={`c${countKey}`} steps={START_STEPS} onDone={onCountdownDone} /> : null}
          {phase === "resumeCountdown" ? <CountdownOverlay key={`r${countKey}`} steps={RESUME_STEPS} onDone={onCountdownDone} /> : null}
          {phase === "paused" ? <PauseMenu onResume={resume} onRestart={() => setConfirm("restart")} onHome={() => setConfirm("home")} /> : null}
          {phase === "paused" && confirm === "restart" ? (
            <ConfirmationDialog
              testID="restart-dialog"
              title="Restart run?"
              message="Progress in this run will be lost."
              confirmLabel="Restart"
              destructive
              onConfirm={startRun}
              onCancel={() => setConfirm(null)}
            />
          ) : null}
          {phase === "paused" && confirm === "home" ? (
            <ConfirmationDialog
              testID="home-dialog"
              title="Quit to Home?"
              message="Progress in this run will be lost."
              confirmLabel="Home"
              destructive
              onConfirm={goHome}
              onCancel={() => setConfirm(null)}
            />
          ) : null}
          {tutorial && phase === "running" && tutHint ? <TutorialHint step={tutHint} /> : null}
          {tutorial && phase !== "tutorialDone" ? (
            <Pressable style={[s.skip, { top: insets.top + 132 }]} onPress={() => onTutorialExit?.(false)} testID="tutorial-skip-button" accessibilityRole="button" accessibilityLabel="Skip tutorial">
              <Text style={s.skipText}>Skip ›</Text>
            </Pressable>
          ) : null}
          {phase === "tutorialDone" ? <TutorialDonePanel onContinue={() => onTutorialExit?.(true)} /> : null}
          {phase === "revive" ? (
            <RevivePanel
              cost={REVIVE_GEMS[gemRevivesRef.current] ?? 0}
              gemsLeft={gemRevivesRef.current < REVIVE_GEMS.length}
              gems={save.gems}
              score={hud.score}
              onRevive={doRevive}
              onDecline={finishRun}
              ad={tutorial ? undefined : { used: adRevivesRef.current >= AD_REVIVES_PER_RUN, busy: adBusy, testMode: ads.isMock, onPress: doAdRevive }}
            />
          ) : null}
          {phase === "over" && summary ? <GameOverPanel {...summary} onPlayAgain={() => void betweenRuns(startRun)} onHome={() => void betweenRuns(goHome)} adCoins={tutorial || summary.coins === 0 ? undefined : { state: adCoins, testMode: ads.isMock, onPress: doDoubleCoins }} /> : null}
          {adUnavailable ? (
            <ConfirmationDialog
              testID="ad-unavailable-dialog"
              title="Ad not available right now"
              message="We couldn't load an ad. Please try again in a moment."
              confirmLabel="Try again"
              cancelLabel="No thanks"
              onConfirm={() => {
                const retry = adUnavailable;
                setAdUnavailable(null);
                retry();
              }}
              onCancel={() => {
                setAdUnavailable(null);
                if (adCoins === "loading") setAdCoins("idle");
              }}
            />
          ) : null}
        </>
      ) : noGL ? null : (
        <LoadingOverlay message="Preparing track..." testID="run-loading" />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface, overflow: "hidden" },
  skip: { position: "absolute", right: 16, height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: c.hudPanel, borderWidth: 2, borderColor: c.brandPrimary, justifyContent: "center" },
  skipText: { fontFamily: fonts.display, fontSize: 16, color: c.onSurface },
}));

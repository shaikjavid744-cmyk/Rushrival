import { Canvas, Picture, Skia, SkPicture, useImage } from "@shopify/react-native-skia";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";

import { ConfirmationDialog } from "@/src/components/ui/ConfirmationDialog";
import { LoadingOverlay } from "@/src/components/ui/LoadingOverlay";
import { PauseMenu } from "@/src/components/ui/PauseMenu";
import { useBackAction } from "@/src/hooks/useBackAction";
import { audio } from "@/src/services/audio";
import { haptics } from "@/src/services/haptics";
import { useGame } from "@/src/state/GameProvider";
import { makeStyles } from "@/src/theme";

import { GameEngine, GameEvent } from "./engine";
import type { Action } from "./player";
import { makeViewport } from "./projection";
import { Renderer, Sprites } from "./renderer";
import { SPRITE_SOURCES } from "./sprites";
import { CountdownOverlay, RESUME_STEPS, START_STEPS } from "./ui/CountdownOverlay";
import { GameOverPanel, RunSummary } from "./ui/GameOverPanel";
import { Hud } from "./ui/Hud";
import { TouchControls } from "./ui/TouchControls";

type Phase = "countdown" | "running" | "paused" | "resumeCountdown" | "crashed" | "over";

const SWIPE_DIST = 26;
const CRASH_TO_SUMMARY_MS = 900;

function useSprites(): Sprites | null {
  const rushRun = useImage(SPRITE_SOURCES.rushRun);
  const rushJump = useImage(SPRITE_SOURCES.rushJump);
  const rushSlide = useImage(SPRITE_SOURCES.rushSlide);
  const coin = useImage(SPRITE_SOURCES.coin);
  const low = useImage(SPRITE_SOURCES.low);
  const high = useImage(SPRITE_SOURCES.high);
  const train = useImage(SPRITE_SOURCES.train);
  const bg = useImage(SPRITE_SOURCES.bg);
  return useMemo(() => {
    if (!rushRun || !rushJump || !rushSlide || !coin || !low || !high || !train || !bg) return null;
    return { rushRun, rushJump, rushSlide, coin, low, high, train, bg };
  }, [rushRun, rushJump, rushSlide, coin, low, high, train, bg]);
}

function emptyPicture(): SkPicture {
  const rec = Skia.PictureRecorder();
  rec.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
  return rec.finishRecordingAsPicture();
}

export default function RunScreen() {
  const s = useStyles();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { save, bankRun } = useGame();
  const sprites = useSprites();

  const engineRef = useRef<GameEngine | null>(null);
  if (!engineRef.current) engineRef.current = new GameEngine();

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
  const crashAtRef = useRef(0);
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
    const outcome = bankRun({ runId: e.runId, coins: e.coinsCollected, score: e.score, distance });
    setSummary({ score: e.score, coins: e.coinsCollected, distance, newBest: outcome.newBest });
    setHud({ score: e.score, coins: e.coinsCollected, distance });
    if (outcome.newBest) {
      audio.play("best");
      haptics.success();
    }
    setPhase("over");
  }, [bankRun, setPhase]);
  const finishRef = useRef(finishRun);
  finishRef.current = finishRun;

  const startRun = useCallback(() => {
    // Abandoned/previous run is discarded without banking (bank happens only in finishRun).
    engineRef.current!.reset();
    dirtyRef.current = true;
    setSummary(null);
    setConfirm(null);
    setHud({ score: 0, coins: 0, distance: 0 });
    setCountKey((k) => k + 1);
    setPhase("countdown");
  }, [setPhase]);

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

  const goHome = useCallback(() => router.replace("/menu"), [router]);

  const onCountdownDone = useCallback(() => setPhase("running"), [setPhase]);

  const doInput = useCallback(
    (a: Action) => {
      if (phaseRef.current !== "running") return;
      const e = engineRef.current!;
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
    const renderer = new Renderer(sprites);
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
      let fx = { shake: 0, flash: 0 };

      if (ph === "running") {
        e.update(dt);
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
        fx = { shake: Math.max(0, 1 - t / 450) * 12, flash: Math.max(0, 0.45 - t / 700) };
        if (t > CRASH_TO_SUMMARY_MS) finishRef.current();
      }

      if (ph === "running" || animating || dirtyRef.current) {
        dirtyRef.current = false;
        const v = vpRef.current;
        const rec = Skia.PictureRecorder();
        const canvas = rec.beginRecording(Skia.XYWHRect(0, 0, v.width, v.height));
        renderer.draw(canvas, e, v, fx);
        picture.value = rec.finishRecordingAsPicture();
      }

      if (ph === "running" && now - hudAt > 100) {
        hudAt = now;
        const d = Math.floor(e.distance);
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
  }, [sprites, handleEvents, picture]);

  // ---- auto-pause on background ---------------------------------------------
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st !== "active") pause();
    });
    return () => sub.remove();
  }, [pause]);

  // ---- Android back (and Escape on web dev) ---------------------------------
  useBackAction(() => {
    const p = phaseRef.current;
    if (p === "running" || p === "countdown" || p === "resumeCountdown") pause();
    else if (p === "paused" && confirm) setConfirm(null);
    else if (p === "paused") resume();
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
      // Dev-only: drop n coins just ahead in the runner's lane (exercises the real pickup path).
      placeCoinsAhead(n = 3) {
        const e = engineRef.current!;
        for (let i = 0; i < n; i++) e.addCoin(e.player.lane, e.distance + 4 + i * 1.5);
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

  const showControls = save.settings.accessibilityButtons && (phase === "running" || phase === "countdown" || phase === "resumeCountdown");

  return (
    <View style={s.root} testID="run-screen">
      <GestureDetector gesture={pan}>
        <View style={StyleSheet.absoluteFill} testID="run-gesture-area" accessibilityLabel="Swipe to move, jump and slide">
          {sprites ? (
            <Canvas style={StyleSheet.absoluteFill}>
              <Picture picture={picture} />
            </Canvas>
          ) : null}
        </View>
      </GestureDetector>

      {sprites ? (
        <>
          <Hud
            score={hud.score}
            coins={hud.coins}
            distance={hud.distance}
            fps={__DEV__ ? fps : null}
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
          {phase === "over" && summary ? <GameOverPanel {...summary} onPlayAgain={startRun} onHome={goHome} /> : null}
        </>
      ) : (
        <LoadingOverlay message="Preparing track..." testID="run-loading" />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface, overflow: "hidden" },
}));

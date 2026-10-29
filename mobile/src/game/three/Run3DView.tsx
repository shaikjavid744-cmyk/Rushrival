import { ExpoWebGLRenderingContext, GLView } from "expo-gl";
import React, { useEffect, useRef, useState } from "react";
import { AppState, Platform, StyleSheet } from "react-native";

import type { RigLook, WorldPalette } from "@/src/config/catalog";
import type { Graphics } from "@/src/save/schema";

import { GLLife, MEMORY_RESTORE_MS, nextGLLife } from "./glLifecycle";
import { ThreeRenderer } from "./ThreeRenderer";

interface Props {
  width: number;
  height: number;
  look: RigLook;
  palette: WorldPalette;
  worldId: string;
  graphics: Graphics;
  onReady: (r: ThreeRenderer) => void;
  /** GL unavailable / init failed → caller falls back to the Skia 2D renderer. */
  onFail: (reason: string) => void;
  /** GL resources were released (background / low memory); stop rendering until onReady fires again. */
  onSuspend?: () => void;
}

const INIT_TIMEOUT_MS = 6000;

/** three.js r16x needs WebGL2; on web check before mounting GLView (which throws during mount otherwise). */
let webGL2Cache: boolean | null = null;
function webGL2Available(): boolean {
  if (Platform.OS !== "web") return true;
  if (webGL2Cache !== null) return webGL2Cache; // probe once: each getContext() creates a new WebGL context
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    webGL2Cache = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webGL2Cache = false;
  }
  return webGL2Cache;
}

/** Catches GLView errors thrown during mount/render so the run falls back to Skia instead of crashing. */
class GLBoundary extends React.Component<{ onFail: (reason: string) => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: Error) {
    this.props.onFail(String(err?.message ?? err));
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Standard expo-gl path: GLView → WebGL context → three.js WebGLRenderer (Android GLES3 / web WebGL2). */
function GLSurface({ width, height, look, palette, worldId, graphics, onReady, onFail }: Props) {
  const done = useRef(false);
  const rRef = useRef<ThreeRenderer | null>(null);
  const failRef = useRef(onFail);
  failRef.current = onFail;

  useEffect(() => {
    const t = setTimeout(() => {
      if (!done.current) {
        done.current = true;
        failRef.current("GL context timeout");
      }
    }, INIT_TIMEOUT_MS);
    return () => {
      clearTimeout(t);
      rRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    rRef.current?.resize(width, height);
  }, [width, height]);

  const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    try {
      // The drawable always matches the view's real pixel size (native and web), so use its exact ratio.
      const ratio = gl.drawingBufferWidth / Math.max(1, width);
      const r = new ThreeRenderer(gl, width, height, ratio, palette, graphics, worldId);
      await r.loadRunner(look);
      if (done.current) return r.dispose();
      done.current = true;
      rRef.current = r;
      onReady(r);
    } catch (err) {
      if (done.current) return;
      done.current = true;
      failRef.current(String((err as Error)?.message ?? err));
    }
  };

  return <GLView testID="run-3d-view" style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />;
}

/** Releases the GL scene on background / low memory and rebuilds it on resume (REQ-249). */
function useGLLife(onSuspend?: () => void): GLLife {
  const [life, setLife] = useState<GLLife>("live");
  const suspendRef = useRef(onSuspend);
  suspendRef.current = onSuspend;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const go = (ev: Parameters<typeof nextGLLife>[1]) =>
      setLife((cur) => {
        const next = nextGLLife(cur, ev, AppState.currentState === "active");
        if (cur === "live" && next === "suspended") suspendRef.current?.();
        return next;
      });
    const change = AppState.addEventListener("change", (st) => go(st === "active" ? "active" : st === "background" ? "background" : "inactive"));
    const mem = AppState.addEventListener("memoryWarning", () => {
      go("memoryWarning");
      clearTimeout(timer);
      timer = setTimeout(() => go("restore"), MEMORY_RESTORE_MS);
    });
    return () => {
      clearTimeout(timer);
      change.remove();
      mem?.remove(); // memoryWarning returns undefined on web
    };
  }, []);
  return life;
}

export function Run3DView(props: Props) {
  const ok = useRef(webGL2Available()).current;
  const { onFail } = props;
  const life = useGLLife(props.onSuspend);
  useEffect(() => {
    if (!ok) onFail("WebGL2 not available");
  }, [ok, onFail]);
  if (!ok) return null;
  // Unmounting GLSurface disposes the renderer (scene + textures + context); remounting creates a fresh one.
  if (life === "suspended") return null;
  return (
    <GLBoundary onFail={onFail}>
      <GLSurface {...props} />
    </GLBoundary>
  );
}

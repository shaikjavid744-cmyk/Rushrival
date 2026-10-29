import { Asset } from "expo-asset";
import { Platform } from "react-native";
import { Skia, type SkImage } from "@shopify/react-native-skia";
import { useEffect, useState } from "react";

import { BOARDS, POWERUP_IMAGES, WORLDS } from "@/src/config/catalog";

import { SPRITE_SOURCES } from "./sprites";

/**
 * Decoded Skia images held in memory for the whole session. Filled once at startup (splash), so a run
 * never touches the network (offline gameplay). Any load failure degrades to a 1x1 colour image.
 * NOTE (web): import this module only after CanvasKit has loaded.
 */
const cache = new Map<number, SkImage>();
let fallback: SkImage | null = null;

export const GAME_IMAGE_MODULES: number[] = [...Object.values(SPRITE_SOURCES), ...Object.values(POWERUP_IMAGES), ...BOARDS.map((b) => b.image), ...WORLDS.map((w) => w.image)];

function fallbackImage(): SkImage | null {
  if (fallback) return fallback;
  try {
    const surf = Skia.Surface.Make(1, 1);
    surf?.getCanvas().drawColor(Skia.Color("#FFC83D"));
    fallback = surf?.makeImageSnapshot() ?? null;
  } catch {
    fallback = null;
  }
  return fallback;
}

export async function loadSkImage(mod: number): Promise<SkImage | null> {
  const hit = cache.get(mod);
  if (hit) return hit;
  try {
    const a = Asset.fromModule(mod);
    await a.downloadAsync();
    const uri = a.localUri ?? a.uri;
    const data = Platform.OS === "web" ? Skia.Data.fromBytes(new Uint8Array(await (await fetch(uri)).arrayBuffer())) : await Skia.Data.fromURI(uri);
    const img = Skia.Image.MakeImageFromEncoded(data);
    if (!img) throw new Error("decode failed");
    cache.set(mod, img);
    return img;
  } catch (e) {
    console.warn("[images] using fallback for asset", mod, e);
    return fallbackImage();
  }
}

export async function preloadGameImages(): Promise<void> {
  await Promise.all(GAME_IMAGE_MODULES.map(loadSkImage));
}

/** Cached image for a bundled module; loads (never throws) if it wasn't preloaded. */
export function useCachedImage(mod: number): SkImage | null {
  const [img, setImg] = useState<SkImage | null>(() => cache.get(mod) ?? null);
  useEffect(() => {
    let on = true;
    const hit = cache.get(mod);
    if (hit) setImg(hit);
    else loadSkImage(mod).then((i) => on && setImg(i));
    return () => {
      on = false;
    };
  }, [mod]);
  return img;
}

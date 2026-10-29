import { Asset } from "expo-asset";

import { SPRITE_SOURCES, UI_IMAGES } from "@/src/game/sprites";

import { SFX_SOURCES } from "./audio";

export async function preloadAssets(): Promise<void> {
  const modules = [...Object.values(SPRITE_SOURCES), UI_IMAGES.logo, UI_IMAGES.velactra, ...SFX_SOURCES];
  await Asset.loadAsync(modules);
}

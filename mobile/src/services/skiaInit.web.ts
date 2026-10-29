import { LoadSkiaWeb } from "@shopify/react-native-skia/lib/module/web";

// Web: load CanvasKit (WASM served from /public/canvaskit.wasm) before any Skia component mounts.
export async function initSkia(): Promise<void> {
  await LoadSkiaWeb({ locateFile: (file: string) => `/${file}` });
}

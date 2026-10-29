import { WithSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import React from "react";

import { LoadingOverlay } from "@/src/components/ui/LoadingOverlay";

// Web: RunScreen (and every Skia import) is loaded only after CanvasKit is ready.
export default function RunHost() {
  return (
    <WithSkiaWeb
      getComponent={() => import("./RunScreen")}
      fallback={<LoadingOverlay message="Preparing track..." testID="run-loading" />}
      opts={{ locateFile: (file: string) => `/${file}` }}
    />
  );
}

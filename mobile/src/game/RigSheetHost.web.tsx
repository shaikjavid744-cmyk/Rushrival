import { WithSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import React from "react";

import { LoadingOverlay } from "@/src/components/ui/LoadingOverlay";

export default function RigSheetHost() {
  return <WithSkiaWeb getComponent={() => import("./RigSheet")} fallback={<LoadingOverlay message="Loading rig..." testID="rig-loading" />} opts={{ locateFile: (file: string) => `/${file}` }} />;
}

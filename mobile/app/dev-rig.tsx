import { Redirect } from "expo-router";
import React from "react";

import RigSheetHost from "@/src/game/RigSheetHost";

/** Dev-only pose contact sheet (never reachable in release builds). */
export default function DevRig() {
  if (!__DEV__) return <Redirect href="/" />;
  return <RigSheetHost />;
}

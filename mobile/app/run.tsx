import { Redirect } from "expo-router";
import React from "react";

import RunHost from "@/src/game/RunHost";
import { useGame } from "@/src/state/GameProvider";

export default function RunRoute() {
  const { ready } = useGame();
  if (!ready) return <Redirect href="/" />;
  return <RunHost />;
}

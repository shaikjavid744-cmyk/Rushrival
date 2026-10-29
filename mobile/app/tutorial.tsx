import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback } from "react";

import RunHost from "@/src/game/RunHost";
import { markEvent } from "@/src/save/economy";
import { useGame } from "@/src/state/GameProvider";

/** Guided tutorial run. First time → character/board intro (/get-started); replay from Settings → back. Grants nothing. */
export default function TutorialRoute() {
  const router = useRouter();
  const { replay } = useLocalSearchParams<{ replay?: string }>();
  const { update, ready } = useGame();
  const onExit = useCallback(
    (completed: boolean) => {
      update((s) => markEvent(s, completed ? "tutorial:done" : "tutorial:skipped"));
      if (replay === "1" && router.canGoBack()) router.back();
      else router.replace("/get-started");
    },
    [replay, router, update],
  );
  if (!ready) return <Redirect href="/" />;
  return <RunHost tutorial onTutorialExit={onExit} />;
}

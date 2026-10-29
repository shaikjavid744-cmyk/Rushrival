import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { BackHandler, Platform } from "react-native";

/**
 * Handles Android hardware back while the screen is focused.
 * Dev web preview: Escape key simulates Android back (testing aid).
 */
export function useBackAction(handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        ref.current();
        return true;
      });
      let onKey: ((e: KeyboardEvent) => void) | null = null;
      if (Platform.OS === "web" && typeof window !== "undefined") {
        onKey = (e: KeyboardEvent) => {
          if (e.key === "Escape") ref.current();
        };
        window.addEventListener("keydown", onKey);
      }
      return () => {
        sub.remove();
        if (onKey) window.removeEventListener("keydown", onKey);
      };
    }, []),
  );
}

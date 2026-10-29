// Design tokens for Rush Rivals. Dark (navy) game theme only.
// Keys match the "color" block of /app/design_guidelines.json (plus game extras).
// Plain key = background, `on` key = text/icon on top of it.

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const dark = {
  surface: "#0A1128",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#16224A",
  onSurfaceSecondary: "#E1E7F5",
  surfaceTertiary: "#22346A",
  onSurfaceTertiary: "#FFFFFF",
  surfaceTertiaryDeep: "#121D40",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#0A1128",
  muted: "#8FA5D1",

  // Electric blue = primary actions
  brand: "#1F8BFF",
  onBrand: "#FFFFFF",
  brandPrimary: "#1F8BFF",
  brandPrimaryDeep: "#0D52C2",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#FFC107",
  onBrandSecondary: "#3A1C00",
  brandTertiary: "#FF8C00",
  onBrandTertiary: "#FFFFFF",
  accent: "#00D4FF",

  // Gold = coins / PLAY
  gold: "#FFC107",
  goldDeep: "#B37A00",
  onGold: "#3A1C00",

  success: "#22D36B",
  successDeep: "#12904A",
  onSuccess: "#00331A",
  warning: "#FF9100",
  onWarning: "#4D2B00",
  error: "#FF3B4A",
  errorDeep: "#B3121F",
  onError: "#FFFFFF",
  info: "#00B0FF",
  onInfo: "#FFFFFF",

  border: "#2C3E6B",
  borderStrong: "#3D5699",
  divider: "#2C3E6B",
  overlayScrim: "rgba(5, 10, 26, 0.82)",
  hudPanel: "rgba(10, 17, 40, 0.66)",
  shadow: "#000000",
};

export type ThemeColors = typeof dark;

export const colors = dark;

export const fonts = {
  display: "LilitaOne",
  body: "Nunito-Bold",
  bodyHeavy: "Nunito-ExtraBold",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 };
export const radius = { sm: 8, md: 16, lg: 24, pill: 999 };

export const defaultScheme = "dark" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light: dark, dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.(defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? dark };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors: c } = useTheme();
    return useMemo(() => StyleSheet.create(factory(c)), [c]);
  };
}

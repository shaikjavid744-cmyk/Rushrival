import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const supported = Platform.OS !== "web";

function run(fn: () => Promise<void>) {
  if (!haptics.enabled || !supported) return;
  fn().catch(() => undefined);
}

export const haptics = {
  enabled: true,
  selection: () => run(() => Haptics.selectionAsync()),
  light: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heavy: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};

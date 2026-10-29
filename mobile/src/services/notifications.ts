import * as Notifications from "expo-notifications";

export type NotifResult = "granted" | "denied";

/** Checks first; shows the OS prompt only if it can still be asked. Never throws (unsupported → denied). */
export async function requestNotificationPermission(): Promise<NotifResult> {
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return "granted";
    if (!cur.canAskAgain) return "denied";
    const res = await Notifications.requestPermissionsAsync();
    return res.granted ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

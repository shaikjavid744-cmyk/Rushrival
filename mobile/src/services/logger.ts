/**
 * Central Logger (REQ-183): console + Firebase Crashlytics on native builds when configured.
 * Never throws — an SDK that fails to initialise is logged once and skipped (REQ-186).
 */
import { firebase } from "@/src/services/firebaseNative";

export const logger = {
  info(msg: string, ctx?: Record<string, unknown>) {
    console.log(`[rr] ${msg}`, ctx ?? "");
    firebase()?.log(msg);
  },
  error(err: unknown, ctx?: Record<string, unknown>) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.warn(`[rr] ${e.message}`, ctx ?? "");
    try {
      firebase()?.recordError(e, ctx);
    } catch {
      /* crash reporter must never crash the app */
    }
  },
};

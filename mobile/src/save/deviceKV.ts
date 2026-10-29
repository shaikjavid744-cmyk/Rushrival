import { storage } from "@/src/utils/storage";

import type { KVStore } from "./saveManager";

/** KVStore backed by the app storage util (AsyncStorage on native, localStorage on web). */
export const deviceKV: KVStore = {
  async get(key) {
    const v = await storage.getItem(key, null);
    if (v === null || v === undefined) return null;
    return typeof v === "string" ? v : JSON.stringify(v);
  },
  set: (key, value) => storage.setItem(key, value),
  remove: (key) => storage.removeItem(key),
};

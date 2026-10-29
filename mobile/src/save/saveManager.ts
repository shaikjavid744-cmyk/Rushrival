import { checksum } from "./checksum";
import { defaultSave, migrate, SAVE_VERSION, SaveData, validateSave } from "./schema";

/** Minimal async string KV so the save logic is storage-agnostic and testable. */
export interface KVStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<boolean>;
  remove(key: string): Promise<boolean>;
}

export const SAVE_KEYS = {
  main: "rr_save_main",
  tmp: "rr_save_tmp",
  marker: "rr_save_marker", // proves a save existed -> unreadable main means corruption, not first launch
};

export type LoadStatus = "new" | "ok" | "migrated" | "recovered" | "reset";

export interface LoadResult {
  data: SaveData;
  status: LoadStatus;
}

export function encodeSave(data: SaveData): string {
  const body = JSON.stringify(data);
  return JSON.stringify({ v: SAVE_VERSION, sum: checksum(body), data });
}

/** Returns validated data (migrated if needed) or null when unreadable/corrupt. */
export function decodeSave(raw: string | null): { data: SaveData; migrated: boolean } | null {
  if (raw == null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const env = parsed as Record<string, unknown>;

  if ("v" in env && "data" in env && "sum" in env) {
    if (typeof env.v !== "number" || env.v > SAVE_VERSION || env.v < 0) return null;
    if (checksum(JSON.stringify(env.data)) !== env.sum) return null;
    const dataVersion = (env.data as any)?.version ?? env.v;
    const upgraded = env.v < SAVE_VERSION ? migrate(env.data, dataVersion) : env.data;
    const data = validateSave(upgraded);
    return data ? { data, migrated: env.v < SAVE_VERSION } : null;
  }
  // Legacy unversioned (v0) save.
  if ("best" in env || "coins" in env) {
    const data = validateSave(migrate(env, 0));
    return data ? { data, migrated: true } : null;
  }
  return null;
}

/** Safe write: temp copy first, then main, then drop temp. A crash mid-write leaves one valid copy. */
export async function writeSave(kv: KVStore, data: SaveData): Promise<boolean> {
  const str = encodeSave(data);
  const okTmp = await kv.set(SAVE_KEYS.tmp, str);
  if (!okTmp) return false;
  const okMain = await kv.set(SAVE_KEYS.main, str);
  if (!okMain) return false;
  await kv.set(SAVE_KEYS.marker, "1");
  await kv.remove(SAVE_KEYS.tmp);
  return true;
}

export async function loadSave(kv: KVStore): Promise<LoadResult> {
  const [main, tmp, marker] = await Promise.all([kv.get(SAVE_KEYS.main), kv.get(SAVE_KEYS.tmp), kv.get(SAVE_KEYS.marker)]);

  const fromMain = decodeSave(main);
  if (fromMain) {
    if (fromMain.migrated) await writeSave(kv, fromMain.data);
    return { data: fromMain.data, status: fromMain.migrated ? "migrated" : "ok" };
  }
  const fromTmp = decodeSave(tmp);
  if (fromTmp) {
    await writeSave(kv, fromTmp.data);
    return { data: fromTmp.data, status: "recovered" };
  }
  const data = defaultSave();
  if (main != null || tmp != null || marker != null) {
    await writeSave(kv, data);
    return { data, status: "reset" };
  }
  return { data, status: "new" };
}

/** DEV ONLY: overwrite the save with garbage to exercise the recovery path. */
export async function corruptSave(kv: KVStore): Promise<void> {
  await kv.set(SAVE_KEYS.main, '{"v":1,"sum":"deadbeef","data":{"coins":-5,');
  await kv.remove(SAVE_KEYS.tmp);
  await kv.set(SAVE_KEYS.marker, "1");
}

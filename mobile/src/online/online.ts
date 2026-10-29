/**
 * Online layer (Phase 3): API client with token refresh, an ordered offline queue (persisted) and server
 * reconciliation. Guests never touch any of this — guest/offline play is unchanged.
 */
import { storage } from "@/src/utils/storage";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1`;
const K = { tokens: "rr.online.tokens", user: "rr.online.user", queue: "rr.online.queue" };
// Stored as JSON strings (StorageItemValue is a flat JSON type).
const put = (k: string, v: unknown) => storage.setItem(k, JSON.stringify(v));
async function get<T>(k: string, fb: T): Promise<T> {
  const raw = await storage.getItem<string | null>(k, null);
  try {
    return raw ? (JSON.parse(raw) as T) : fb;
  } catch {
    return fb;
  }
}

export interface ApiErr {
  status: number;
  code: string;
  message: string;
  details?: any;
}
export interface Tokens {
  access_token: string;
  refresh_token: string;
}
export interface Op {
  id: string; // also the Idempotency-Key
  path: string;
  body?: unknown;
  createdAt: number;
}
export type SyncStatus = "idle" | "syncing" | "synced" | "failed";

export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;

class Online {
  tokens: Tokens | null = null;
  user: any = null;
  queue: Op[] = [];
  status: SyncStatus = "idle";
  lastError: string | null = null;
  private runs = new Map<string, { run_id: string; seed: number; run_token: string }>();
  private listeners = new Set<() => void>();
  private flushing = false;
  onServerUser: ((u: any) => void) | null = null;
  onSignedOut: (() => void) | null = null;
  /** Guest purchase owner id (X-Device-Id), set by the monetization layer. */
  deviceId: string | null = null;
  private runRefs = new Map<string, string>();
  /** Server run id for a finished local run (online run id, or the offline-report id). */
  runRef(localRunId: string) {
    return this.runRefs.get(localRunId) ?? `run_off_${localRunId}`;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }
  private emit() {
    this.listeners.forEach((f) => f());
  }
  get signedIn() {
    return !!this.tokens;
  }

  async init() {
    this.tokens = await get<Tokens | null>(K.tokens, null);
    this.user = await get<any>(K.user, null);
    this.queue = await get<Op[]>(K.queue, []);
    this.emit();
  }

  async request<T = any>(path: string, opts: { method?: string; body?: unknown; idem?: string; auth?: boolean } = {}, retried = false): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.auth !== false && this.tokens) headers.Authorization = `Bearer ${this.tokens.access_token}`;
    if (opts.idem) headers["Idempotency-Key"] = opts.idem;
    if (this.deviceId) headers["X-Device-Id"] = this.deviceId;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 12000);
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, { method: opts.method ?? "GET", headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body), signal: ctl.signal });
    } catch {
      throw { status: 0, code: "network", message: "Can't reach the server" } as ApiErr;
    } finally {
      clearTimeout(timer);
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data as T;
    const err: ApiErr = { status: res.status, code: data?.error?.code ?? "http_error", message: data?.error?.message ?? "Service unavailable", details: data?.error?.details };
    if (res.status === 401 && err.code === "token_expired" && !retried && this.tokens) {
      await this.refresh();
      return this.request<T>(path, opts, true);
    }
    if (res.status === 401 && opts.auth !== false && this.tokens && !path.startsWith("/auth/")) await this.clearSession();
    throw err;
  }

  private refreshing: Promise<void> | null = null;
  private refresh() {
    if (!this.refreshing)
      this.refreshing = (async () => {
        try {
          const t = await this.request<Tokens>("/auth/refresh", { method: "POST", body: { refresh_token: this.tokens!.refresh_token }, auth: false }, true);
          await this.setTokens(t);
        } catch (e) {
          if ((e as ApiErr).status === 401) await this.clearSession();
          throw e;
        } finally {
          this.refreshing = null;
        }
      })();
    return this.refreshing;
  }

  async setTokens(t: Tokens) {
    this.tokens = { access_token: t.access_token, refresh_token: t.refresh_token };
    await put(K.tokens, this.tokens);
    this.emit();
  }
  async setSession(d: Tokens & { user: any }) {
    await this.setTokens(d);
    await this.setUser(d.user);
  }
  async setUser(u: any) {
    this.user = u;
    await put(K.user, u);
    this.emit();
  }
  async clearSession() {
    const wasSignedIn = !!this.tokens;
    this.tokens = null;
    this.user = null;
    this.queue = [];
    this.status = "idle";
    await Promise.all([storage.removeItem(K.tokens), storage.removeItem(K.user), storage.removeItem(K.queue)]);
    if (wasSignedIn) this.onSignedOut?.();
    this.emit();
  }

  // ------------------------------------------------------------------ queue ---
  async enqueue(path: string, body?: unknown) {
    if (!this.signedIn) return;
    this.queue.push({ id: uid(), path, body, createdAt: Date.now() });
    await put(K.queue, this.queue);
    this.emit();
    void this.flush();
  }

  /** Ordered replay. Network/5xx/429 stop the flush (retry later); permanent 4xx rejections are dropped. */
  async flush(): Promise<void> {
    if (!this.signedIn || this.flushing || this.queue.length === 0) return;
    this.flushing = true;
    this.status = "syncing";
    this.emit();
    let failed = false;
    while (this.queue.length) {
      const op = this.queue[0];
      try {
        await this.request(op.path, { method: "POST", body: op.body, idem: op.id });
      } catch (e) {
        const er = e as ApiErr;
        if (er.status === 0 || er.status >= 500 || er.status === 429 || er.code === "idempotency_in_progress" || er.status === 401) {
          failed = true;
          this.lastError = er.message;
          break;
        }
      }
      this.queue.shift();
      await put(K.queue, this.queue);
    }
    this.flushing = false;
    this.status = failed ? "failed" : "synced";
    this.emit();
    if (!failed) await this.pull();
  }

  /** Server is the authority for signed-in wallets/inventory. */
  async pull() {
    if (!this.signedIn) return;
    try {
      const { user } = await this.request<{ user: any }>("/me");
      await this.setUser(user);
      if (this.queue.length === 0) this.onServerUser?.(user);
    } catch {
      /* offline: keep local */
    }
  }

  // ------------------------------------------------------------------- runs ---
  startRun(localRunId: string, world: string) {
    if (!this.signedIn) return;
    this.request<{ run_id: string; seed: number; run_token: string }>("/runs/start", { method: "POST", body: { world } })
      .then((r) => this.runs.set(localRunId, r))
      .catch(() => undefined); // offline → reported later as an offline run
  }

  recordRun(localRunId: string, stats: { duration: number; distance: number; coins: number; score: number; powerupsUsed: number; revives: number; world: string; eventTokens: number }) {
    if (!this.signedIn) return;
    const body = { duration: stats.duration, distance: stats.distance, coins: stats.coins, score: stats.score, powerups_used: stats.powerupsUsed, revives: stats.revives, world: stats.world, event_tokens: stats.eventTokens };
    const started = this.runs.get(localRunId);
    this.runs.delete(localRunId);
    this.runRefs.set(localRunId, started ? started.run_id : `run_off_${localRunId}`);
    if (started) void this.enqueue("/runs/finish", { ...body, ...started });
    else void this.enqueue("/runs/offline", { ...body, run_id: `run_off_${localRunId}`, seed: 0 });
  }
}

export const online = new Online();

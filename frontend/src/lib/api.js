// API clients for the public website (/api/v1/public/*) and the admin realm (/api/v1/admin/*).
export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_V1 = `${BACKEND_URL}/api/v1`;

/** Resolve backend-relative art paths like /api/static/game/hero_rush.png */
export const artUrl = (p) => (!p ? "" : /^https?:/.test(p) ? p : `${BACKEND_URL}${p}`);

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || "Something went wrong. Please try again.");
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function parse(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const e = body?.error || {};
    throw new ApiError(res.status, e.code || "http_error", e.message, e.details);
  }
  return body;
}

async function send(url, opts) {
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new ApiError(0, "network_error", "We can't reach the game servers right now.");
  }
  return parse(res);
}

export const publicApi = {
  get: (path) => send(`${API_V1}/public${path}`, { headers: { Accept: "application/json" } }),
  post: (path, body) =>
    send(`${API_V1}/public${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};

// ---------------------------------------------------------------- admin ---
let csrfToken = null;
let onUnauthorized = null;
export const setCsrf = (t) => {
  csrfToken = t;
};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

export async function adminRequest(method, path, body, { idempotencyKey, raw } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  let res;
  try {
    res = await fetch(`${API_V1}/admin${path}`, {
      method,
      headers,
      credentials: "include",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network_error", "Can't reach the server. Check your connection and retry.");
  }
  const isAuthPath = path.startsWith("/auth/login") || path.startsWith("/auth/totp");
  if (res.status === 401 && !isAuthPath && onUnauthorized) {
    const err = await parse(res).catch((e) => e);
    onUnauthorized(err);
    throw err;
  }
  if (raw && res.ok) return res;
  return parse(res);
}

export const adminApi = {
  get: (p) => adminRequest("GET", p),
  post: (p, b = {}, o) => adminRequest("POST", p, b, o),
  put: (p, b, o) => adminRequest("PUT", p, b, o),
  patch: (p, b, o) => adminRequest("PATCH", p, b, o),
};

export const qs = (obj) => {
  const s = new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  const str = s.toString();
  return str ? `?${str}` : "";
};

export const newIdemKey = () =>
  (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9-]/g, "");

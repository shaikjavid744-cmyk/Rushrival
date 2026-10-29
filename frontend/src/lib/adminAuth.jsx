import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { adminApi, setCsrf, setUnauthorizedHandler } from "@/lib/api";

const Ctx = createContext(null);
export const IDLE_MS = 30 * 60 * 1000;

export function AdminAuthProvider({ children }) {
  const [state, setState] = useState({ status: "loading", admin: null, sessionId: null, reason: null });
  const lastActive = useRef(Date.now());

  const setSession = useCallback((admin, csrf, sessionId = null) => {
    setCsrf(csrf);
    lastActive.current = Date.now();
    setState({ status: "authed", admin, sessionId, reason: null });
  }, []);

  const expire = useCallback((reason) => {
    setCsrf(null);
    setState({ status: "anon", admin: null, sessionId: null, reason });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await adminApi.get("/me");
      setSession(me.admin, me.csrf_token, me.session_id);
    } catch (e) {
      if (e.status === 401) expire(null);
      else setState({ status: "error", admin: null, sessionId: null, reason: e.message });
    }
  }, [setSession, expire]);

  useEffect(() => {
    setUnauthorizedHandler((err) => expire(err?.code === "session_expired" ? "Your session expired. Sign in again." : "Please sign in again."));
    refresh();
    return () => setUnauthorizedHandler(null);
  }, [refresh, expire]);

  // Client-side idle timeout (mirrors the server's 30-min idle expiry).
  useEffect(() => {
    if (state.status !== "authed") return undefined;
    const bump = () => (lastActive.current = Date.now());
    const evs = ["mousedown", "keydown", "scroll", "touchstart"];
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(() => {
      if (Date.now() - lastActive.current > IDLE_MS) {
        adminApi.post("/auth/logout").catch(() => null);
        expire("You were signed out after 30 minutes of inactivity.");
      }
    }, 15000);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(t);
    };
  }, [state.status, expire]);

  const signOut = useCallback(async () => {
    await adminApi.post("/auth/logout").catch(() => null);
    expire("You signed out.");
  }, [expire]);

  const can = useCallback((p) => !!state.admin?.permissions?.includes(p), [state.admin]);

  return <Ctx.Provider value={{ ...state, setSession, refresh, signOut, expire, can }}>{children}</Ctx.Provider>;
}

export const useAdmin = () => useContext(Ctx);

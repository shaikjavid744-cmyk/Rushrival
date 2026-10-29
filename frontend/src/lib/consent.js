import { createContext, createElement, useCallback, useContext, useEffect, useState } from "react";

const KEY = "rr_cookie_consent";
const Ctx = createContext(null);

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

/**
 * Analytics loader. No analytics provider is configured for the website yet, so this is a no-op.
 * It is ONLY ever called after the visitor accepts the cookie banner.
 */
function loadAnalytics() {
  window.__RR_ANALYTICS_ALLOWED__ = true;
}

export function ConsentProvider({ children }) {
  const [consent, setConsent] = useState(read);
  const [open, setOpen] = useState(() => !read());

  useEffect(() => {
    if (consent?.choice === "accepted") loadAnalytics();
  }, [consent]);

  const choose = useCallback((choice) => {
    const v = { choice, at: new Date().toISOString(), version: 1 };
    localStorage.setItem(KEY, JSON.stringify(v));
    setConsent(v);
    setOpen(false);
  }, []);

  const reopen = useCallback(() => setOpen(true), []);
  return createElement(Ctx.Provider, { value: { consent, open, choose, reopen } }, children);
}

export const useConsent = () => useContext(Ctx);

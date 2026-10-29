import { useEffect } from "react";

const SITE = "Rush Rivals";
const OG_IMAGE = "/brand/og-logo.png";

function upsert(selector, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement(attrs.rel ? "link" : "meta");
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
}

/** Per-page title, description, Open Graph + canonical; robots noindex for the admin realm. */
export function useSeo({ title, description, path, noindex = false, image }) {
  useEffect(() => {
    const full = title ? `${title} · ${SITE}` : `${SITE} — Run · Dodge · Collect · Compete`;
    const url = `${window.location.origin}${path ?? window.location.pathname}`;
    const img = `${window.location.origin}${image || OG_IMAGE}`;
    document.title = full;
    upsert('meta[name="description"]', { name: "description", content: description || "" });
    upsert('meta[property="og:title"]', { property: "og:title", content: full });
    upsert('meta[property="og:description"]', { property: "og:description", content: description || "" });
    upsert('meta[property="og:type"]', { property: "og:type", content: "website" });
    upsert('meta[property="og:url"]', { property: "og:url", content: url });
    upsert('meta[property="og:image"]', { property: "og:image", content: img });
    upsert('meta[property="og:site_name"]', { property: "og:site_name", content: SITE });
    upsert('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    upsert('link[rel="canonical"]', { rel: "canonical", href: url });
    upsert('meta[name="robots"]', { name: "robots", content: noindex ? "noindex, nofollow" : "index, follow" });
  }, [title, description, path, noindex, image]);
}

export function Seo(props) {
  useSeo(props);
  return null;
}

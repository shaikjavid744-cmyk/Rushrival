// Writes public/sitemap.xml + public/robots.txt from the backend sitemap data.
// Usage: node scripts/generate-sitemap.js   (reads REACT_APP_BACKEND_URL from .env)
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { buildSitemapXml } = require("../src/sitemapXml");

(async () => {
  const origin = process.env.SITE_ORIGIN || process.env.REACT_APP_BACKEND_URL;
  const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/v1/public/sitemap`);
  const data = await r.json();
  const pub = path.join(__dirname, "..", "public");
  fs.writeFileSync(path.join(pub, "sitemap.xml"), buildSitemapXml(origin, data));
  const robots = ["User-agent: *", ...(data.disallow || ["/admin"]).map((d) => `Disallow: ${d}`), "", `Sitemap: ${origin}/sitemap.xml`, ""];
  fs.writeFileSync(path.join(pub, "robots.txt"), robots.join("\n"));
  console.log("wrote sitemap.xml and robots.txt for", origin);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

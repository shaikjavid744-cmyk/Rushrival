// Dev-server middleware: serves /sitemap.xml at the site root from the backend sitemap data
// (GET /api/v1/public/sitemap, which includes published news). /robots.txt is a static file in /public.
// For production builds, run `node scripts/generate-sitemap.js` to refresh public/sitemap.xml.
const { buildSitemapXml } = require("./sitemapXml");

module.exports = function setup(app) {
  app.get("/robots.txt", async (req, res, next) => {
    try {
      const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/v1/public/sitemap`);
      const data = r.ok ? await r.json() : { disallow: ["/admin"] };
      const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0];
      const host = (req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0];
      const lines = ["User-agent: *", ...(data.disallow || ["/admin"]).map((d) => `Disallow: ${d}`), "", `Sitemap: ${proto}://${host}/sitemap.xml`, ""];
      res.set("Content-Type", "text/plain; charset=utf-8");
      res.send(lines.join("\n"));
    } catch (e) {
      next(); // static public/robots.txt
    }
  });
  app.get("/sitemap.xml", async (req, res, next) => {
    const backend = process.env.REACT_APP_BACKEND_URL;
    try {
      const r = await fetch(`${backend}/api/v1/public/sitemap`);
      if (!r.ok) throw new Error(`status ${r.status}`);
      const data = await r.json();
      const proto = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const origin = host ? `${proto.split(",")[0]}://${host.split(",")[0]}` : backend;
      res.set("Content-Type", "application/xml; charset=utf-8");
      res.send(buildSitemapXml(origin, data));
    } catch (e) {
      next(); // fall back to the static public/sitemap.xml
    }
  });
};

// Shared by src/setupProxy.js and scripts/generate-sitemap.js (CommonJS, Node only).
function esc(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);
}

function buildSitemapXml(origin, data) {
  const disallow = data.disallow || ["/admin"];
  const urls = (data.pages || [])
    .filter((p) => !disallow.some((d) => p.path.startsWith(d)))
    .map((p) => {
      const lastmod = p.lastmod ? `<lastmod>${esc(String(p.lastmod).slice(0, 10))}</lastmod>` : "";
      return `  <url><loc>${esc(origin + p.path)}</loc>${lastmod}</url>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

module.exports = { buildSitemapXml };

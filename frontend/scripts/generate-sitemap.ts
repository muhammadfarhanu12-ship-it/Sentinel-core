import fs from "node:fs";
import { CRAWLABLE_PUBLIC_ROUTES, SITE_URL } from "../seo.config";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${CRAWLABLE_PUBLIC_ROUTES
  .map(
    (route) => `
  <url>
    <loc>${SITE_URL}${route}</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>`
  )
  .join("")}
</urlset>`;

fs.writeFileSync("./public/sitemap.xml", `${xml}\n`, "utf-8");

console.log("sitemap.xml generated successfully!");

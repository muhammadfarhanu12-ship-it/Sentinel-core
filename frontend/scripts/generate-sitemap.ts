import fs from "node:fs";

const domain = "https://mefyx.com";

// Only include PUBLIC pages here
const routes: string[] = [
  "/",
  "/features",
  "/pricing",
  "/docs",
  "/blog",
  "/contact",
  "/privacy-policy",
  "/terms-of-service",
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (route) => `
  <url>
    <loc>${domain}${route}</loc>
    <changefreq>${route === "/" ? "weekly" : "monthly"}</changefreq>
    <priority>${route === "/" ? "1.0" : "0.8"}</priority>
  </url>`
  )
  .join("")}
</urlset>`;

fs.writeFileSync("./public/sitemap.xml", `${xml}\n`, "utf-8");

console.log("sitemap.xml generated successfully!");

import fs from 'node:fs';
import path from 'node:path';
import {
  AUTH_GATED_ROUTE_PREFIXES,
  AUTH_ROUTE_PATHS,
  LANDING_DESCRIPTION,
  LANDING_TITLE,
  ROBOTS_NOINDEX,
  SOFTWARE_APPLICATION_SCHEMA,
  canonicalUrl,
} from '../seo.config';

const distDir = path.resolve('dist');
const indexPath = path.join(distDir, 'index.html');
const schemaJson = JSON.stringify(SOFTWARE_APPLICATION_SCHEMA).replace(/</g, '\\u003c');

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function upsertTitle(html: string, title: string) {
  const tag = `<title>${escapeHtml(title)}</title>`;
  return /<title>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/i, tag)
    : html.replace('</head>', `    ${tag}\n  </head>`);
}

function upsertMetaName(html: string, name: string, content: string) {
  const tag = `<meta name="${escapeHtml(name)}" content="${escapeHtml(content)}" />`;
  const pattern = new RegExp(`<meta\\s+[^>]*name=["']${escapeRegExp(name)}["'][^>]*>`, 'i');

  return pattern.test(html)
    ? html.replace(pattern, tag)
    : html.replace('</head>', `    ${tag}\n  </head>`);
}

function removeMetaName(html: string, name: string) {
  const pattern = new RegExp(`\\s*<meta\\s+[^>]*name=["']${escapeRegExp(name)}["'][^>]*>`, 'i');
  return html.replace(pattern, '');
}

function upsertCanonical(html: string, href: string) {
  const tag = `<link rel="canonical" href="${escapeHtml(href)}" />`;
  return /<link\s+[^>]*rel=["']canonical["'][^>]*>/i.test(html)
    ? html.replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>/i, tag)
    : html.replace('</head>', `    ${tag}\n  </head>`);
}

function removeCanonical(html: string) {
  return html.replace(/\s*<link\s+[^>]*rel=["']canonical["'][^>]*>/i, '');
}

function upsertSchema(html: string) {
  const tag = `<script id="mefyx-software-schema" type="application/ld+json">${schemaJson}</script>`;
  return /<script\s+[^>]*id=["']mefyx-software-schema["'][\s\S]*?<\/script>/i.test(html)
    ? html.replace(/<script\s+[^>]*id=["']mefyx-software-schema["'][\s\S]*?<\/script>/i, tag)
    : html.replace('</head>', `    ${tag}\n  </head>`);
}

function removeSchema(html: string) {
  return html.replace(/\s*<script\s+[^>]*id=["']mefyx-software-schema["'][\s\S]*?<\/script>/i, '');
}

function landingHtml() {
  return `
      <div class="min-h-screen bg-slate-950 text-slate-50 font-sans">
        <header class="border-b border-white/10 bg-slate-950">
          <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <a href="/" class="text-xl font-bold">Mefyx</a>
            <nav aria-label="Primary" class="flex gap-5 text-sm text-slate-300">
              <a href="/signin">Sign In</a>
              <a href="/signup">Start Free</a>
            </nav>
          </div>
        </header>
        <main>
          <section class="mx-auto max-w-7xl px-6 py-20">
            <p class="mb-4 text-sm font-medium text-indigo-300">AI application security</p>
            <h1 class="max-w-4xl text-5xl font-bold leading-tight">Mefyx is an AI security firewall for LLM applications.</h1>
            <p class="mt-6 max-w-3xl text-lg text-slate-300">${escapeHtml(LANDING_DESCRIPTION)}</p>
            <div class="mt-8 flex flex-wrap gap-4">
              <a href="/signup" class="rounded-lg bg-indigo-500 px-5 py-3 font-medium text-white">Start Free</a>
              <a href="/docs" class="rounded-lg border border-white/15 px-5 py-3 font-medium text-white">View Documentation</a>
            </div>
          </section>
          <section aria-labelledby="security-capabilities" class="border-t border-white/10 bg-slate-900/40">
            <div class="mx-auto grid max-w-7xl gap-6 px-6 py-16 md:grid-cols-3">
              <article>
                <h2 id="security-capabilities" class="text-xl font-semibold">Prompt injection defense</h2>
                <p class="mt-3 text-slate-400">Inspect AI prompts before they reach production models.</p>
              </article>
              <article>
                <h2 class="text-xl font-semibold">Sensitive data controls</h2>
                <p class="mt-3 text-slate-400">Detect and redact exposed secrets, credentials, and personal data.</p>
              </article>
              <article>
                <h2 class="text-xl font-semibold">Security monitoring</h2>
                <p class="mt-3 text-slate-400">Track AI security traffic, blocked requests, and operational signals.</p>
              </article>
            </div>
          </section>
        </main>
      </div>
    `.trim();
}

function setLandingRoot(html: string) {
  const root = `<div id="root"><!--prerender:landing-->${landingHtml()}<!--/prerender:landing--></div>`;
  const prerenderedRoot = /<div id="root"><!--prerender:landing-->[\s\S]*?<!--\/prerender:landing--><\/div>/i;

  if (prerenderedRoot.test(html)) return html.replace(prerenderedRoot, root);

  return html.replace('<div id="root"></div>', root);
}

function stripLandingRoot(html: string) {
  return html.replace(
    /<div id="root"><!--prerender:landing-->[\s\S]*?<!--\/prerender:landing--><\/div>/i,
    '<div id="root"></div>',
  );
}

function withLandingHead(html: string) {
  return upsertSchema(upsertCanonical(upsertMetaName(upsertTitle(html, LANDING_TITLE), 'description', LANDING_DESCRIPTION), canonicalUrl('/')));
}

function withNoindexHead(html: string) {
  const shellHtml = removeSchema(removeCanonical(removeMetaName(stripLandingRoot(html), 'description')));
  return upsertMetaName(upsertTitle(shellHtml, 'Mefyx App'), 'robots', ROBOTS_NOINDEX);
}

function writeNoindexShells(html: string) {
  const noindexHtml = withNoindexHead(html);
  const shellPaths = [...AUTH_GATED_ROUTE_PREFIXES, ...AUTH_ROUTE_PATHS];

  shellPaths.forEach((routePath) => {
    const normalized = routePath.replace(/^\//, '');
    const targetDir = path.join(distDir, normalized);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'index.html'), noindexHtml, 'utf-8');
  });
}

const indexHtml = fs.readFileSync(indexPath, 'utf-8');
const prerenderedHtml = setLandingRoot(withLandingHead(indexHtml));

fs.writeFileSync(indexPath, prerenderedHtml, 'utf-8');
writeNoindexShells(prerenderedHtml);

console.log('public landing page prerendered successfully!');

import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import LandingPage from '../src/pages/LandingPage';
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

function upsertMetaProperty(html: string, property: string, content: string) {
  const tag = `<meta property="${escapeHtml(property)}" content="${escapeHtml(content)}" />`;
  const pattern = new RegExp(`<meta\\s+[^>]*property=["']${escapeRegExp(property)}["'][^>]*>`, 'i');

  return pattern.test(html)
    ? html.replace(pattern, tag)
    : html.replace('</head>', `    ${tag}\n  </head>`);
}

function removeSocialMeta(html: string) {
  return html.replace(/\s*<meta\s+[^>]*(?:property=["']og:[^"']+["']|name=["']twitter:[^"']+["'])[^>]*>/gi, '');
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
  return renderToStaticMarkup(
    createElement(StaticRouter, { location: '/' }, createElement(LandingPage)),
  );
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
  let updatedHtml = upsertSchema(upsertCanonical(upsertMetaName(upsertTitle(html, LANDING_TITLE), 'description', LANDING_DESCRIPTION), canonicalUrl('/')));

  for (const [property, content] of [
    ['og:type', 'website'],
    ['og:site_name', 'Mefyx'],
    ['og:title', LANDING_TITLE],
    ['og:description', LANDING_DESCRIPTION],
    ['og:url', canonicalUrl('/')],
  ]) {
    updatedHtml = upsertMetaProperty(updatedHtml, property, content);
  }

  for (const [name, content] of [
    ['twitter:card', 'summary'],
    ['twitter:title', LANDING_TITLE],
    ['twitter:description', LANDING_DESCRIPTION],
  ]) {
    updatedHtml = upsertMetaName(updatedHtml, name, content);
  }

  return updatedHtml;
}

function withNoindexHead(html: string) {
  const shellHtml = removeSocialMeta(removeSchema(removeCanonical(removeMetaName(stripLandingRoot(html), 'description'))));
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

// Static hosts need a separate SPA fallback without the homepage snapshot.
fs.writeFileSync(path.join(distDir, 'spa.html'), stripLandingRoot(indexHtml), 'utf-8');
fs.writeFileSync(indexPath, prerenderedHtml, 'utf-8');
writeNoindexShells(prerenderedHtml);

console.log('public landing page prerendered successfully!');

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const BASE = process.env.SITE_BASE_URL || 'https://gepacblog.github.io/blog-gepac';

const postsPath = path.join(ROOT, 'data', 'posts.json');
if (!fs.existsSync(postsPath)) {
  console.log('No existe data/posts.json');
  process.exit(0);
}

const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));

generateSitemap(posts);
generateRobots();
patchArticles(posts);

console.log('SEO técnico generado: sitemap.xml, robots.txt y metadatos en artículos');

function generateSitemap(posts) {
  const urls = new Set();
  urls.add(`${BASE}/`);
  urls.add(`${BASE}/index.html`);
  urls.add(`${BASE}/historico.html`);
  urls.add(`${BASE}/buscar.html`);
  urls.add(`${BASE}/metricas.html`);

  for (const p of posts) {
    urls.add(`${BASE}/${stripDotSlash(p.url)}`);
  }

  const now = new Date().toISOString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Array.from(urls)
  .map((u) => `  <url><loc>${escapeXml(u)}</loc><lastmod>${now}</lastmod></url>`)
  .join('\n')}
</urlset>\n`;

  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
}

function generateRobots() {
  const txt = `User-agent: *
Allow: /

Sitemap: ${BASE}/sitemap.xml
`;
  fs.writeFileSync(path.join(ROOT, 'robots.txt'), txt);
}

function patchArticles(posts) {
  for (const p of posts) {
    const rel = stripDotSlash(p.url);
    const filePath = path.join(ROOT, rel);
    if (!fs.existsSync(filePath)) continue;

    let html = fs.readFileSync(filePath, 'utf8');
    const absUrl = `${BASE}/${rel}`;
    const ogImage = p.image?.startsWith('http') ? p.image : `${BASE}/${stripDotSlash(p.image || '')}`;

    html = upsertMeta(html, 'canonical', `<link rel="canonical" href="${absUrl}"/>`);
    html = upsertMeta(html, 'og:url', `<meta property="og:url" content="${absUrl}"/>`);
    html = upsertMeta(html, 'og:image', `<meta property="og:image" content="${ogImage}"/>`);
    html = upsertMeta(html, 'twitter:card', `<meta name="twitter:card" content="summary_large_image"/>`);

    fs.writeFileSync(filePath, html);
  }
}

function upsertMeta(html, key, tag) {
  const checks = {
    canonical: /<link\s+rel="canonical"[^>]*>/i,
    'og:url': /<meta\s+property="og:url"[^>]*>/i,
    'og:image': /<meta\s+property="og:image"[^>]*>/i,
    'twitter:card': /<meta\s+name="twitter:card"[^>]*>/i,
  };

  if (checks[key].test(html)) {
    return html.replace(checks[key], tag);
  }

  return html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

function stripDotSlash(s = '') {
  return String(s).replace(/^\.\//, '');
}

function escapeXml(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

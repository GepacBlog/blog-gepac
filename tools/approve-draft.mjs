#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const arg = process.argv[2] || 'all';

const draftsPath = path.join(ROOT, 'data', 'drafts.json');
const postsPath = path.join(ROOT, 'data', 'posts.json');

const drafts = fs.existsSync(draftsPath) ? JSON.parse(fs.readFileSync(draftsPath, 'utf8')) : [];
const posts = fs.existsSync(postsPath) ? JSON.parse(fs.readFileSync(postsPath, 'utf8')) : [];

if (!drafts.length) {
  console.log('No hay borradores');
  process.exit(0);
}

const selected = arg === 'all' ? drafts : drafts.filter((d) => d.id === arg);
if (!selected.length) {
  console.log('No se encontró borrador:', arg);
  process.exit(0);
}

for (const d of selected) {
  const relUrl = createArticle(d);
  posts.unshift({
    id: `${d.editorial.toLowerCase()}-${d.dateISO}-${slugify(d.title)}`,
    editorial: d.editorial,
    date: d.dateISO,
    title: d.title,
    summary: d.summary,
    image: d.imageMain,
    url: relUrl,
    author: d.author,
    category: d.editorial,
    comments: 0,
  });
}

const remaining = drafts.filter((d) => !selected.some((x) => x.id === d.id));
posts.sort((a, b) => new Date(b.date) - new Date(a.date));

fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2));
fs.writeFileSync(draftsPath, JSON.stringify(remaining, null, 2));
fs.writeFileSync(path.join(ROOT, 'data', 'posts.js'), `window.POSTS = ${JSON.stringify(posts, null, 2)};\n`);
fs.writeFileSync(path.join(ROOT, 'data', 'drafts.js'), `window.DRAFTS = ${JSON.stringify(remaining, null, 2)};\n`);

try { execSync('node tools/generate-seo.mjs', { stdio: 'ignore' }); } catch {}

console.log(`Publicados desde borrador: ${selected.length}`);

function createArticle(d) {
  const [year, month] = d.dateISO.split('-');
  const monthNames = {
    '01':'enero','02':'febrero','03':'marzo','04':'abril','05':'mayo','06':'junio',
    '07':'julio','08':'agosto','09':'septiembre','10':'octubre','11':'noviembre','12':'diciembre'
  };
  const monthFolder = `${month}-${monthNames[month] || 'mes'}`;
  const editorialSlug = d.editorial.toLowerCase();
  const dir = path.join(ROOT, 'historicos', year, monthFolder, editorialSlug);
  fs.mkdirSync(dir, { recursive: true });

  const seq = nextNumber(dir);
  const fileName = `${seq}_${d.dateISO}_${slugify(d.title)}.html`;
  const relUrl = `./historicos/${year}/${monthFolder}/${editorialSlug}/${fileName}`;

  const imgMain = String(d.imageMain || '').replace('./assets/', '../../../../assets/');
  const imgEnd = String(d.imageEnd || '').replace('./assets/', '../../../../assets/');
  const bg = d.editorial === 'GEPAC'
    ? 'linear-gradient(135deg, #efe6ff 0%, #ffffff 100%)'
    : 'linear-gradient(135deg, #ffeedc 0%, #ffffff 100%)';

  const linkedSummary = applySeoLinks(escapeHTML(d.summary || ''), d.seoLinks || []);
  const linkedBody = String(d.content || '')
    .split(/\n\n+/)
    .map((p) => `<p>${applySeoLinks(escapeHTML(p), d.seoLinks || [])}</p>`)
    .join('\n');

  const html = `<!doctype html>
<html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${escapeHTML(d.title)}</title>
<meta name="description" content="${escapeHTML(d.summary)}"/>
</head>
<body style="font-family:Inter,system-ui,sans-serif;background:${bg};padding:20px;color:#222">
<div style="max-width:800px;margin:0 auto;background:#fff;border:1px solid #e3e6ef;border-radius:12px;padding:20px;line-height:1.6;">
<a href="../../../../index.html">← Volver a portada</a>
<h1>${escapeHTML(d.title)}</h1>
<div style="color:#666;margin-bottom:1rem">Editorial ${escapeHTML(d.editorial)} · ${escapeHTML(d.dateISO)} · ${escapeHTML(d.author || '')}</div>
${imgMain ? `<img src="${escapeHTML(imgMain)}" alt="${escapeHTML(d.title)}" style="width:100%;max-width:760px;border-radius:10px;margin:0 0 16px;border:1px solid #ddd"/>` : ''}
<p>${linkedSummary}</p>
${linkedBody}
${imgEnd ? `<p><img src="${escapeHTML(imgEnd)}" alt="${escapeHTML(d.title)}" style="width:100%;max-width:760px;border-radius:10px;margin:16px 0 0;border:1px solid #ddd"/></p>` : ''}
</div></body></html>`;

  fs.writeFileSync(path.join(dir, fileName), html);
  return relUrl;
}

function nextNumber(dir) {
  const files = fs.readdirSync(dir);
  const nums = files.map((f) => /^([0-9]{3})_/.exec(f)?.[1]).filter(Boolean).map(Number);
  return String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
}

function slugify(str='') {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

function escapeHTML(str='') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function applySeoLinks(htmlSafeText = '', links = []) {
  let out = htmlSafeText;
  for (const l of links) {
    if (!l?.term || !l?.url) continue;
    const esc = l.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${esc}\\b`);
    out = out.replace(
      re,
      `<a href="${l.url}" target="_blank" rel="noopener noreferrer" style="color:#0a66cc;text-decoration:underline;text-underline-offset:2px;font-weight:600;">${l.term}</a>`
    );
  }
  return out;
}

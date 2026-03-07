#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const SRC = process.argv[2];
if (!SRC) {
  console.log('Uso: node tools/import-from-folder.mjs "/ruta/carpeta"');
  process.exit(1);
}

const monthMap = {
  'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04', 'mayo': '05', 'junio': '06',
  'julio': '07', 'agosto': '08', 'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
};
const monthName = {
  '01':'enero','02':'febrero','03':'marzo','04':'abril','05':'mayo','06':'junio',
  '07':'julio','08':'agosto','09':'septiembre','10':'octubre','11':'noviembre','12':'diciembre'
};

const docxFiles = walk(SRC).filter(f => f.toLowerCase().endsWith('.docx'));
if (!docxFiles.length) {
  console.log('No se encontraron .docx');
  process.exit(0);
}

// Limpieza de contenido generado antes (solo 2026)
rmrf(path.join(ROOT, 'historicos', '2026'));
fs.mkdirSync(path.join(ROOT, 'historicos', '2026'), { recursive: true });
rmrf(path.join(ROOT, 'assets', 'uploads'));
fs.mkdirSync(path.join(ROOT, 'assets', 'uploads'), { recursive: true });

const posts = [];

for (const file of docxFiles) {
  const ctx = contextFromPath(file);
  if (!ctx) continue;

  const txt = docxToText(file);
  const parsed = parseDocText(txt);
  const title = parsed.title || fallbackTitle(file);
  const summary = clamp((parsed.metaDescription || parsed.summary || firstSentence(parsed.body || txt)).trim(), 260);

  const y = ctx.year;
  const monthFolder = `${ctx.monthNum}-${monthName[ctx.monthNum]}`;
  const editorialSlug = ctx.editorial.toLowerCase();
  const outDir = path.join(ROOT, 'historicos', y, monthFolder, editorialSlug);
  fs.mkdirSync(outDir, { recursive: true });

  const day = String(ctx.day).padStart(2, '0');
  const dateISO = `${y}-${ctx.monthNum}-${day}`;
  const seq = nextNumber(outDir);
  const slug = slugify(title);
  const fileName = `${seq}_${dateISO}_${slug}.html`;
  const relUrl = `./historicos/${y}/${monthFolder}/${editorialSlug}/${fileName}`;

  const { img01, img02 } = pickImages(path.dirname(file));
  const imgMain = img01 ? copyAsset(img01, ctx.editorial, dateISO, slug, '01') : 'https://via.placeholder.com/1200x700?text=Noticia';
  const imgEnd = img02 ? copyAsset(img02, ctx.editorial, dateISO, slug, '02') : '';

  const html = buildHtml({
    title,
    editorial: ctx.editorial,
    author: parsed.author || (ctx.editorial === 'GEPAC' ? 'Equipo GEPAC' : 'Equipo AEAL'),
    dateISO,
    summary,
    body: sanitizeBody(parsed.body || txt),
    imgMain,
    imgEnd,
    seoTitle: parsed.seoTitle,
    metaDescription: parsed.metaDescription || summary,
    keywords: parsed.keywords,
  });

  fs.writeFileSync(path.join(outDir, fileName), html);

  posts.push({
    id: `${editorialSlug}-${dateISO}-${slug}`,
    editorial: ctx.editorial,
    date: dateISO,
    title,
    summary,
    image: imgMain,
    url: relUrl,
    author: parsed.author || (ctx.editorial === 'GEPAC' ? 'Equipo GEPAC' : 'Equipo AEAL'),
    category: ctx.editorial,
    comments: 0,
  });
}

posts.sort((a,b)=> new Date(b.date) - new Date(a.date));
fs.writeFileSync(path.join(ROOT, 'data', 'posts.json'), JSON.stringify(posts, null, 2));
fs.writeFileSync(path.join(ROOT, 'data', 'posts.js'), `window.POSTS = ${JSON.stringify(posts, null, 2)};\n`);

console.log(`Importadas: ${posts.length}`);

function walk(dir) {
  const out = [];
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function contextFromPath(filePath) {
  const parts = filePath.split(path.sep);
  const y = parts.find(p => /^\d{4}$/.test(p)) || '2026';
  const editorialPart = parts.find(p => /^\d{2}\s+(GEPAC|AEAL)$/i.test(p)) || parts.find(p => /(^|\s)(GEPAC|AEAL)($|\s)/i.test(p));
  if (!editorialPart) return null;
  const editorial = /\bAEAL\b/i.test(editorialPart) ? 'AEAL' : 'GEPAC';

  const monthPart = parts.find(p => /^\d{2}\s+/.test(p) && /Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre/i.test(p));
  if (!monthPart) return null;
  const monthWord = monthPart.replace(/^\d{2}\s+/, '').trim().toLowerCase();
  const monthNum = monthMap[normalize(monthWord)] || '01';

  const articleFolder = parts[parts.length - 2] || '';
  const dayMatch = articleFolder.match(/^(\d{1,2})\s+/);
  const day = dayMatch ? Math.min(28, Math.max(1, Number(dayMatch[1]))) : 1;

  return { year: y, editorial, monthNum, day };
}

function normalize(s='') {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function docxToText(p) {
  try {
    return execSync(`textutil -convert txt -stdout ${quote(p)}`, { encoding:'utf8' });
  } catch {
    return '';
  }
}

function parseDocText(src='') {
  const lines = src.split(/\r?\n/).map(l=>l.trim());
  const nonEmpty = lines.filter(Boolean);
  const title = (nonEmpty[0] || '').replace(/^Serie\s+(GEPAC|AEAL)\s*[–-]\s*/i,'').trim();

  let seoTitle = '';
  let metaDescription = '';
  const keywords = [];
  let author = '';

  const bodyLines = [];
  let inKeywords = false;
  for (let i=0;i<lines.length;i++) {
    const l = lines[i];
    const n = normalize(l);

    if (!l) { if (!inKeywords) bodyLines.push(''); continue; }

    if (/^title\s*seo/i.test(n)) { seoTitle = (lines[i+1] || '').trim(); continue; }
    if (/^meta\s*description/i.test(n)) { metaDescription = (lines[i+1] || '').trim(); continue; }
    if (/^keywords?/i.test(n)) { inKeywords = true; continue; }
    if (/^firma editorial/i.test(n)) continue;

    if (inKeywords) {
      if (/^[•\-]/.test(l)) {
        const kw = l.replace(/^[•\-]\s*/, '').replace(/[\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
        if (kw) keywords.push(kw);
        continue;
      }
      if (/^\s*$/.test(l)) { inKeywords = false; continue; }
      if (/^(title seo|meta description)/i.test(n)) { inKeywords = false; }
      else continue;
    }

    if (/^autor\s*:/i.test(l)) { author = l.replace(/^autor\s*:/i, '').trim(); continue; }

    // limpia líneas de control SEO/marketing
    if (/palabra clave|keyword|meta description|slug|cta|enlace interno|h1|h2/i.test(n)) continue;

    bodyLines.push(l);
  }

  const body = bodyLines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  const summary = body.split(/\n\n+/)[0] || '';

  return { title, summary, body, seoTitle, metaDescription, keywords, author };
}

function sanitizeBody(b='') {
  return b
    .replace(/_{3,}/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildHtml({title, editorial, author, dateISO, summary, body, imgMain, imgEnd, seoTitle, metaDescription, keywords}) {
  const bg = editorial === 'GEPAC'
    ? 'linear-gradient(135deg, #efe6ff 0%, #ffffff 100%)'
    : 'linear-gradient(135deg, #ffeedc 0%, #ffffff 100%)';
  const kw = (keywords || []).slice(0,12).join(', ');
  const headTitle = escapeHTML(seoTitle || title);
  const metaDesc = escapeHTML(metaDescription || summary || title);

  const summaryHtml = linkifyText(escapeHTML(summary));
  const bodyHtml = body
    .split(/\n\n+/)
    .map(p => `<p>${linkifyText(escapeHTML(p))}</p>`)
    .join('\n');

  return `<!doctype html>
<html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${headTitle}</title>
<meta name="description" content="${metaDesc}"/>
${kw ? `<meta name="keywords" content="${escapeHTML(kw)}"/>` : ''}
<meta property="og:title" content="${headTitle}"/>
<meta property="og:description" content="${metaDesc}"/>
</head>
<body style="font-family:Inter,system-ui,sans-serif;background:${bg};padding:20px;color:#222">
<div style="max-width:800px;margin:0 auto;background:#fff;border:1px solid #e3e6ef;border-radius:12px;padding:20px;line-height:1.6;">
<a href="../../../../index.html">← Volver a portada</a>
<h1>${escapeHTML(title)}</h1>
<div style="color:#666;margin-bottom:1rem">Editorial ${escapeHTML(editorial)} · ${escapeHTML(dateISO)} · ${escapeHTML(author)}</div>
${imgMain ? `<img src="${escapeHTML(toArticlePath(imgMain))}" alt="${escapeHTML(title)}" style="width:100%;max-width:760px;border-radius:10px;margin:0 0 16px;border:1px solid #ddd"/>` : ''}
<p>${summaryHtml}</p>
${bodyHtml}
${imgEnd ? `<p><img src="${escapeHTML(toArticlePath(imgEnd))}" alt="${escapeHTML(title)}" style="width:100%;max-width:760px;border-radius:10px;margin:16px 0 0;border:1px solid #ddd"/></p>` : ''}
</div></body></html>`;
}

function toArticlePath(assetRel) {
  return String(assetRel).startsWith('./assets/') ? assetRel.replace('./assets/', '../../../../assets/') : assetRel;
}

function pickImages(dir) {
  const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)).sort((a,b)=>a.localeCompare(b));
  const img01 = files.find(f => /(^|[^0-9])01([^0-9]|$)/.test(f)) || files[0] || null;
  const img02 = files.find(f => /(^|[^0-9])02([^0-9]|$)/.test(f)) || files.find(f => f!==img01) || null;
  return {
    img01: img01 ? path.join(dir, img01) : null,
    img02: img02 ? path.join(dir, img02) : null,
  };
}

function copyAsset(src, editorial, dateISO, slug, slot) {
  const ext = path.extname(src).toLowerCase() || '.jpg';
  const name = `${dateISO}_${editorial.toLowerCase()}_${slug}_${slot}${ext}`;
  const dst = path.join(ROOT, 'assets', 'uploads', name);
  fs.copyFileSync(src, dst);
  return `./assets/uploads/${name}`;
}

function nextNumber(folder) {
  const files = fs.existsSync(folder) ? fs.readdirSync(folder) : [];
  const nums = files.map(f => /^([0-9]{3})_/.exec(f)?.[1]).filter(Boolean).map(Number);
  return String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3,'0');
}

function fallbackTitle(file) {
  return path.basename(file, path.extname(file)).replace(/[_-]+/g,' ').trim();
}

function firstSentence(t='') {
  const x = t.replace(/\s+/g,' ').trim();
  return x.split(/(?<=[.!?])\s+/)[0] || x;
}

function clamp(t='', n=260) {
  return t.length > n ? `${t.slice(0,n-3)}...` : t;
}

function slugify(str='') {
  return normalize(str).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

function escapeHTML(str='') {
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function linkifyText(htmlSafeText='') {
  const links = [
    { term: 'GEPAC', url: 'https://www.gepac.es' },
    { term: 'AEAL', url: 'https://www.aeal.es' },
    { term: 'URJC', url: 'https://www.urjc.es' },
    { term: 'CRIS', url: 'https://criscancer.org' },
    { term: 'Sanofi', url: 'https://www.sanofi.es' }
  ];

  let out = htmlSafeText;
  for (const { term, url } of links) {
    const re = new RegExp(`\\b${term}\\b`);
    out = out.replace(re, `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#0a66cc;text-decoration:underline;text-underline-offset:2px;font-weight:600;">${term}</a>`);
  }
  return out;
}

function quote(s){ return `'${String(s).replace(/'/g, `'\\''`)}'`; }

function rmrf(p){ fs.rmSync(p, { recursive:true, force:true }); }

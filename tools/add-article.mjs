#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const [,, editorial, dateISO, title, summary, image='https://via.placeholder.com/1200x700?text=Noticia'] = process.argv;

if (!editorial || !dateISO || !title || !summary) {
  console.log('Uso: node tools/add-article.mjs <GEPAC|AEAL> <YYYY-MM-DD> "Titulo" "Resumen" [imageUrl]');
  process.exit(1);
}

const root = path.resolve(process.cwd());
const [year, month] = dateISO.split('-');
const monthNames = {
  '01': 'enero','02': 'febrero','03': 'marzo','04': 'abril','05': 'mayo','06': 'junio',
  '07': 'julio','08': 'agosto','09': 'septiembre','10': 'octubre','11': 'noviembre','12': 'diciembre'
};
const monthFolder = `${month}-${monthNames[month] || 'mes'}`;
const editorialSlug = editorial.toLowerCase();
const folder = path.join(root, 'historicos', year, monthFolder, editorialSlug);
fs.mkdirSync(folder, { recursive: true });

const slug = slugify(title);
const nextNumber = String(getNextNumber(folder)).padStart(3, '0');
const fileName = `${nextNumber}_${dateISO}_${slug}.html`;
const filePath = path.join(folder, fileName);
const relUrl = `./historicos/${year}/${monthFolder}/${editorialSlug}/${fileName}`;

const articleHtml = `<!doctype html>
<html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${title}</title>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-WHK7D5DV8Y"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);} 
  gtag('js', new Date());
  gtag('config', 'G-WHK7D5DV8Y');
</script>
</head>
<body style="font-family:Inter,system-ui,sans-serif;background:linear-gradient(140deg,#f4ecff 0%,#fff 55%,#f8f5ff 100%);padding:26px 16px;color:#1f2533">
<div style="max-width:860px;margin:0 auto;background:#fff;border:1px solid #e3e6ef;border-radius:16px;padding:24px;line-height:1.72;box-shadow:0 14px 34px rgba(21,31,52,.08)">
<a href="../../../../index.html" style="display:inline-block;color:#1f5fbf;text-decoration:none;font-weight:700;margin-bottom:12px">← Volver a portada</a>
<h1 style="margin:4px 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:2rem;line-height:1.2">${title}</h1>
<div style="color:#556078;margin-bottom:14px">Editorial ${editorial} · ${dateISO}</div>
<img src="${image}" alt="${title}" style="width:100%;max-width:812px;border-radius:12px;margin:0 0 16px;border:1px solid #d7deea"/>
<p style="margin:0 0 12px;color:#243047">Aquí va el contenido completo de la noticia.</p>
</div>
<script src="../../../../js/analytics.js?v=20260312-1"></script>
</body></html>`;

fs.writeFileSync(filePath, articleHtml);

const newPost = {
  id: `${editorial.toLowerCase()}-${dateISO}-${slug}`,
  editorial,
  date: dateISO,
  title,
  summary,
  image,
  url: relUrl
};

const postsPath = path.join(root, 'data', 'posts.json');
const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
posts.unshift(newPost);
fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2));

const postsJsPath = path.join(root, 'data', 'posts.js');
fs.writeFileSync(postsJsPath, `window.POSTS = ${JSON.stringify(posts, null, 2)};\n`);

console.log('Noticia creada:', relUrl);

function slugify(str = '') {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getNextNumber(folderPath) {
  const files = fs.existsSync(folderPath) ? fs.readdirSync(folderPath) : [];
  const nums = files
    .map((f) => /^([0-9]{3})_/.exec(f)?.[1])
    .filter(Boolean)
    .map((n) => Number(n));
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

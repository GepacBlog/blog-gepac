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
<html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${title}</title></head>
<body style="font-family:Inter,system-ui,sans-serif;max-width:800px;margin:30px auto;padding:0 16px;line-height:1.6;color:#222">
<a href="../../../../index.html">← Volver a portada</a>
<h1>${title}</h1>
<div style="color:#666;margin-bottom:1rem">Editorial ${editorial} · ${dateISO}</div>
<img src="${image}" alt="${title}" style="width:100%;max-width:760px;border-radius:10px;margin:0 0 16px;border:1px solid #ddd"/>
<p>Aquí va el contenido completo de la noticia.</p>
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

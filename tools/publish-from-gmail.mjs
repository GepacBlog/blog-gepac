#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ACCOUNT = process.env.BLOG_MAIL_ACCOUNT || 'agentekrok@gmail.com';
const QUERY = process.env.BLOG_MAIL_QUERY || '(in:important OR (in:inbox is:unread))';
const ROOT = path.resolve(process.cwd());
const TMP = path.join(ROOT, '.mail_tmp');

fs.mkdirSync(TMP, { recursive: true });

const search = runJson(`gog gmail search "${QUERY}" --account ${ACCOUNT} --max 20 --json --no-input`);
const threads = search?.threads || [];

let processed = 0;
let draftsCreated = 0;
const errors = [];
for (const t of threads) {
  try {
    const subject = t.subject || '';

    const threadDir = path.join(TMP, t.id);
    fs.mkdirSync(threadDir, { recursive: true });

    const data = runJson(
      `gog gmail thread get ${t.id} --account ${ACCOUNT} --json --download --out-dir ${shellEscape(threadDir)} --no-input`
    );

    const message = (data?.thread?.messages || []).slice(-1)[0];
    if (!message) continue;

    const headers = mapHeaders(message.payload?.headers || []);
    let parsed = parseSubject(headers.subject || '');
    if (!parsed) parsed = parseSubject(subject || '');
    if (!parsed) continue;
    console.log(`Procesando hilo ${t.id}: ${parsed.editorial} - ${parsed.title}`);

    const bodyText = getPlainText(message.payload);
    const fields = parseBody(bodyText);

    const editorial = parsed.editorial.toUpperCase();
    const title = fields.title || parsed.title || 'Sin título';
    const rawContent = fields.body || bodyWithoutHeaders(bodyText) || bodyText || 'Contenido pendiente';
    const content = sanitizeBody(rawContent);
    const summary = clampSummary(fields.summary || firstSentence(content) || 'Resumen pendiente');
    const author = fields.author || (editorial === 'GEPAC' ? 'Equipo GEPAC' : 'Equipo AEAL');
    const fallbackDate = toISODate(new Date(Number(message.internalDate || Date.now())));
    const dateISO = normalizeDate(fields.date) || fallbackDate;

    const { primaryImagePath, secondaryImagePath } = pickImages(threadDir);
    const imageForCards = primaryImagePath
      ? copyImageToAssets(primaryImagePath, editorial, dateISO, title, '01')
      : 'https://via.placeholder.com/1200x700?text=Noticia';
    const imageForEnd = secondaryImagePath
      ? copyImageToAssets(secondaryImagePath, editorial, dateISO, title, '02')
      : '';

    const relUrl = createArticle({
      editorial,
      dateISO,
      title,
      summary,
      content,
      author,
      imageMain: imageForCards,
      imageEnd: imageForEnd,
    });

    upsertPost({
      editorial,
      date: dateISO,
      title,
      summary,
      image: imageForCards,
      url: relUrl,
      author,
      category: editorial,
      comments: 0,
    });

    run(`gog gmail thread modify ${t.id} --account ${ACCOUNT} --remove UNREAD,IMPORTANT --no-input`);
    processed += 1;
  } catch (err) {
    const msg = `Error en hilo ${t.id}: ${err.message}`;
    errors.push(msg);
    console.error(msg);
  }
}

syncPostsJs();
syncDraftsJs();
writePublisherStatus({ processed, draftsCreated, errors });
if (processed > 0 || draftsCreated > 0) {
  autoGitPublish(processed, draftsCreated);
}
console.log(`Publicadas: ${processed}`);
console.log(`Borradores: ${draftsCreated}`);

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function runJson(cmd) {
  const out = run(cmd);
  return JSON.parse(out || '{}');
}
function shellEscape(v) {
  return `'${String(v).replace(/'/g, `'\\''`)}'`;
}
function mapHeaders(headers) {
  const h = {};
  for (const x of headers) h[(x.name || '').toLowerCase()] = x.value || '';
  return { subject: h.subject || '', from: h.from || '' };
}
function parseSubject(s) {
  const v = String(s || '').trim().replace(/^(re|rv|fwd|fw)\s*:\s*/i, '');

  // Formatos soportados (case-insensitive):
  // [GEPAC] Título
  // GEPAC: Título
  // GEPAC - Título
  // gepac título
  let m = v.match(/^\s*\[(gepac|aeal)\]\s*(.+)$/i);
  if (m) return { editorial: m[1], title: m[2].trim() };

  m = v.match(/^\s*(gepac|aeal)\s*[:\-]\s*(.+)$/i);
  if (m) return { editorial: m[1], title: m[2].trim() };

  m = v.match(/^\s*(gepac|aeal)\s+(.+)$/i);
  if (m) return { editorial: m[1], title: m[2].trim() };

  return null;
}
function b64urlDecode(str = '') {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}
function getPlainText(payload) {
  if (!payload) return '';
  const direct = payload?.mimeType === 'text/plain' ? payload?.body?.data : null;
  if (direct) return b64urlDecode(direct);
  const stack = [...(payload.parts || [])];
  while (stack.length) {
    const p = stack.shift();
    if (p?.mimeType === 'text/plain' && p?.body?.data) return b64urlDecode(p.body.data);
    if (Array.isArray(p?.parts)) stack.push(...p.parts);
  }
  return '';
}
function parseBody(text) {
  const src = String(text || '');
  const compact = src.replace(/\s+/g, ' ').trim();
  const out = { date: '', author: '', summary: '', body: '', title: '' };

  // Extrae campos aunque vengan en una sola línea
  out.date = pick(compact, /Fecha\s*:\s*(.+?)(?=\s+(Autor\s*:|Resumen\s*:|Cuerpo\s*:|T[íi]tulo\s*:)|$)/i);
  out.author = pick(compact, /Autor\s*:\s*(.+?)(?=\s+(Fecha\s*:|Resumen\s*:|Cuerpo\s*:|T[íi]tulo\s*:)|$)/i);
  out.summary = pick(compact, /Resumen\s*:\s*(.+?)(?=\s+(Fecha\s*:|Autor\s*:|Cuerpo\s*:|T[íi]tulo\s*:)|$)/i);
  out.title = pick(compact, /T[íi]tulo\s*:\s*(.+?)(?=\s+(Fecha\s*:|Autor\s*:|Resumen\s*:|Cuerpo\s*:)|$)/i);
  out.body = pick(compact, /Cuerpo\s*:\s*(.+)$/i);

  // Fallback por líneas (si viene bien formateado)
  if (!out.body || !out.summary || !out.author || !out.date) {
    const lines = src.split(/\r?\n/);
    let bodyStart = false;
    const bodyLines = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line && bodyStart) { bodyLines.push(''); continue; }
      if (!out.date && /^Fecha\s*:/i.test(line)) out.date = line.replace(/^Fecha\s*:/i, '').trim();
      else if (!out.author && /^Autor\s*:/i.test(line)) out.author = line.replace(/^Autor\s*:/i, '').trim();
      else if (!out.summary && /^Resumen\s*:/i.test(line)) out.summary = line.replace(/^Resumen\s*:/i, '').trim();
      else if (!out.title && /^T[íi]tulo\s*:/i.test(line)) out.title = line.replace(/^T[íi]tulo\s*:/i, '').trim();
      else if (/^Cuerpo\s*:/i.test(line)) {
        bodyStart = true;
        const first = line.replace(/^Cuerpo\s*:/i, '').trim();
        if (first) bodyLines.push(first);
      } else if (bodyStart) {
        bodyLines.push(raw);
      }
    }
    if (!out.body) out.body = bodyLines.join('\n').trim();
  }

  return out;
}
function pick(text, re) {
  const m = text.match(re);
  return m ? m[1].trim() : '';
}
function firstSentence(text = '') {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.split(/(?<=[.!?])\s+/)[0].slice(0, 260);
}
function clampSummary(s='') {
  const t = String(s).replace(/\s+/g,' ').trim();
  if (!t) return 'Resumen pendiente';
  return t.length > 260 ? `${t.slice(0,257)}...` : t;
}
function bodyWithoutHeaders(src='') {
  return String(src)
    .split(/\r?\n/)
    .filter((ln)=>!/^\s*(Fecha|Autor|Resumen|T[íi]tulo)\s*:/i.test(ln))
    .join('\n')
    .trim();
}
function sanitizeBody(src='') {
  return String(src)
    .replace(/_{3,}/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function toISODate(d) {
  return d.toISOString().slice(0, 10);
}
function normalizeDate(input = '') {
  const v = String(input || '').trim();
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
}
function slugify(str = '') {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function monthFolderFromISO(dateISO) {
  const [, m] = dateISO.split('-');
  const names = { '01':'enero','02':'febrero','03':'marzo','04':'abril','05':'mayo','06':'junio','07':'julio','08':'agosto','09':'septiembre','10':'octubre','11':'noviembre','12':'diciembre' };
  return `${m}-${names[m] || 'mes'}`;
}
function nextNumber(folderPath) {
  const files = fs.existsSync(folderPath) ? fs.readdirSync(folderPath) : [];
  const nums = files.map((f) => /^([0-9]{3})_/.exec(f)?.[1]).filter(Boolean).map(Number);
  return String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
}
function pickImages(dir) {
  if (!fs.existsSync(dir)) return { primaryImagePath: null, secondaryImagePath: null };
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort((a, b) => a.localeCompare(b));

  if (!files.length) return { primaryImagePath: null, secondaryImagePath: null };

  const f01 = files.find((f) => /(^|[^0-9])01([^0-9]|$)/.test(f));
  const f02 = files.find((f) => /(^|[^0-9])02([^0-9]|$)/.test(f));

  const primary = f01 || files[0];
  const secondary = f02 || files.find((f) => f !== primary) || null;

  return {
    primaryImagePath: primary ? path.join(dir, primary) : null,
    secondaryImagePath: secondary ? path.join(dir, secondary) : null,
  };
}
function copyImageToAssets(src, editorial, dateISO, title, slot = '01') {
  const base = `${dateISO}_${editorial.toLowerCase()}_${slugify(title)}_${slot}`;
  const dstDir = path.join(ROOT, 'assets', 'uploads');
  fs.mkdirSync(dstDir, { recursive: true });

  const webpName = `${base}.webp`;
  const webpDst = path.join(dstDir, webpName);

  try {
    run(`cwebp -q 82 -resize 1600 0 ${shellEscape(src)} -o ${shellEscape(webpDst)}`);
    return `./assets/uploads/${webpName}`;
  } catch {
    const ext = path.extname(src).toLowerCase() || '.jpg';
    const fallbackName = `${base}${ext}`;
    fs.copyFileSync(src, path.join(dstDir, fallbackName));
    return `./assets/uploads/${fallbackName}`;
  }
}
function createArticle({ editorial, dateISO, title, summary, content, author, imageMain, imageEnd }) {
  const [year] = dateISO.split('-');
  const monthFolder = monthFolderFromISO(dateISO);
  const editorialSlug = editorial.toLowerCase();
  const folder = path.join(ROOT, 'historicos', year, monthFolder, editorialSlug);
  fs.mkdirSync(folder, { recursive: true });

  const fileName = `${nextNumber(folder)}_${dateISO}_${slugify(title)}.html`;
  const filePath = path.join(folder, fileName);
  const relUrl = `./historicos/${year}/${monthFolder}/${editorialSlug}/${fileName}`;
  const articleImageMain = String(imageMain || '').startsWith('./assets/')
    ? String(imageMain).replace('./assets/', '../../../../assets/')
    : imageMain;
  const articleImageEnd = String(imageEnd || '').startsWith('./assets/')
    ? String(imageEnd).replace('./assets/', '../../../../assets/')
    : imageEnd;

  const articleBg = editorial.toUpperCase() === 'GEPAC'
    ? 'linear-gradient(135deg, #efe6ff 0%, #ffffff 100%)'
    : 'linear-gradient(135deg, #ffeedc 0%, #ffffff 100%)';

  const html = `<!doctype html>
<html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${escapeHTML(title)}</title></head>
<body style="font-family:Inter,system-ui,sans-serif;background:${articleBg};padding:20px;color:#222">
<div style="max-width:800px;margin:0 auto;background:#fff;border:1px solid #e3e6ef;border-radius:12px;padding:20px;line-height:1.6;">
<a href="../../../../index.html">← Volver a portada</a>
<h1>${escapeHTML(title)}</h1>
<div style="color:#666;margin-bottom:1rem">Editorial ${escapeHTML(editorial)} · ${escapeHTML(dateISO)} · ${escapeHTML(author)}</div>
${articleImageMain ? `<img src="${escapeHTML(articleImageMain)}" alt="${escapeHTML(title)}" style="width:100%;max-width:760px;border-radius:10px;margin:0 0 16px;border:1px solid #ddd"/>` : ''}
<p>${escapeHTML(summary)}</p>
${content.split(/\n\n+/).map((p) => `<p>${escapeHTML(p)}</p>`).join('\n')}
${articleImageEnd ? `<p><img src="${escapeHTML(articleImageEnd)}" alt="${escapeHTML(title)}" style="width:100%;max-width:760px;border-radius:10px;margin:16px 0 0;border:1px solid #ddd"/></p>` : ''}
</div>
</body></html>`;

  fs.writeFileSync(filePath, html);
  return relUrl;
}
function upsertPost(post) {
  const pth = path.join(ROOT, 'data', 'posts.json');
  const posts = JSON.parse(fs.readFileSync(pth, 'utf8'));
  posts.unshift({
    id: `${post.editorial.toLowerCase()}-${post.date}-${slugify(post.title)}`,
    editorial: post.editorial,
    date: post.date,
    title: post.title,
    summary: post.summary,
    image: post.image,
    url: post.url,
    author: post.author,
    category: post.category,
    comments: post.comments,
  });
  posts.sort((a,b)=> new Date(b.date)-new Date(a.date));
  fs.writeFileSync(pth, JSON.stringify(posts, null, 2));
}
function syncPostsJs() {
  const posts = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'posts.json'), 'utf8'));
  fs.writeFileSync(path.join(ROOT, 'data', 'posts.js'), `window.POSTS = ${JSON.stringify(posts, null, 2)};\n`);
}
function loadDrafts() {
  const p = path.join(ROOT, 'data', 'drafts.json');
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; }
}
function saveDraft(draft) {
  const p = path.join(ROOT, 'data', 'drafts.json');
  const drafts = loadDrafts();
  if (drafts.some((d) => d.id === draft.id)) return;
  drafts.unshift(draft);
  fs.writeFileSync(p, JSON.stringify(drafts, null, 2));
}
function syncDraftsJs() {
  const drafts = loadDrafts();
  fs.writeFileSync(path.join(ROOT, 'data', 'drafts.js'), `window.DRAFTS = ${JSON.stringify(drafts, null, 2)};\n`);
}
function writePublisherStatus({ processed, draftsCreated, errors }) {
  const status = {
    lastRun: new Date().toISOString(),
    published: processed,
    drafts: draftsCreated,
    message:
      processed > 0
        ? 'Publicación completada correctamente'
        : draftsCreated > 0
        ? `Se crearon ${draftsCreated} borrador(es) pendientes de aprobación`
        : 'No había entradas nuevas para publicar',
  };

  const statusJsonPath = path.join(ROOT, 'data', 'publisher-status.json');
  const statusJsPath = path.join(ROOT, 'data', 'publisher-status.js');
  fs.writeFileSync(statusJsonPath, JSON.stringify(status, null, 2));
  fs.writeFileSync(statusJsPath, `window.PUBLISH_STATUS = ${JSON.stringify(status, null, 2)};\n`);

  const logsDir = path.join(ROOT, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const line = `[${status.lastRun}] published=${processed}${errors.length ? ` errors=${errors.length}` : ''}`;
  fs.appendFileSync(path.join(logsDir, 'publisher.log'), `${line}\n`);
  if (errors.length) {
    fs.appendFileSync(path.join(logsDir, 'publisher-errors.log'), `${errors.join('\n')}\n`);
  }
}

function autoGitPublish(processed, draftsCreated = 0) {
  try {
    try { run('node tools/generate-seo.mjs'); } catch {}

    // 1) stage
    run('git add -A');

    // 2) commit if needed
    const hasChanges = run('git status --porcelain').trim().length > 0;
    if (!hasChanges) {
      console.log('Auto-deploy: sin cambios para subir');
      return;
    }

    const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
    try {
      run(`git commit -m "Auto flow: ${processed} publish, ${draftsCreated} drafts (${stamp})"`);
    } catch (e) {
      // si otro proceso ya dejó todo limpio
      const stillChanges = run('git status --porcelain').trim().length > 0;
      if (stillChanges) throw e;
    }

    // 3) sync remote + push (retry simple)
    try { run('git pull --rebase origin main'); } catch {}
    try {
      run('git push origin main');
    } catch {
      run('git pull --rebase origin main');
      run('git push origin main');
    }

    console.log('Auto-deploy: git push realizado');
  } catch (e) {
    console.error('Auto-deploy git falló:', e.message);
  }
}
function escapeHTML(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

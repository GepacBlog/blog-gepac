#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ACCOUNT = process.env.BLOG_MAIL_ACCOUNT || 'agentekrok@gmail.com';
const QUERY = process.env.BLOG_MAIL_QUERY || '(in:important OR in:inbox)';
const ROOT = path.resolve(process.cwd());
const TMP = path.join(ROOT, '.mail_tmp');

fs.mkdirSync(TMP, { recursive: true });

const search = runJson(`gog gmail search "${QUERY}" --account ${ACCOUNT} --max 20 --json --no-input`);
const threads = search?.threads || [];
const processedThreads = loadProcessedThreads();

let processed = 0;
const errors = [];
for (const t of threads) {
  if (processedThreads.has(t.id)) continue;
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
    const senderEmail = extractEmail(headers.from || '');
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
    const summary = clampSummary(fields.summary || firstCleanSentence(content) || 'Resumen pendiente');
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

    appendAuthorshipLog({
      editorial,
      senderEmail,
      author,
      title,
      threadId: t.id,
    });

    appendMentionsLog({
      editorial,
      title,
      threadId: t.id,
      text: `${title}\n${summary}\n${content}`,
    });

    run(`gog gmail thread modify ${t.id} --account ${ACCOUNT} --remove UNREAD,IMPORTANT --no-input`);
    markThreadProcessed(t.id);
    processed += 1;
  } catch (err) {
    const msg = `Error en hilo ${t.id}: ${err.message}`;
    errors.push(msg);
    console.error(msg);
  }
}

syncPostsJs();
writePublisherStatus({ processed, errors });
if (processed > 0) {
  autoGitPublish(processed);
}
console.log(`Publicadas: ${processed}`);

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

function extractEmail(from='') {
  const m = String(from).match(/<([^>]+@[^>]+)>/);
  if (m) return m[1].trim().toLowerCase();
  const m2 = String(from).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m2 ? m2[0].toLowerCase() : '';
}
function parseSubject(s) {
  const v = String(s || '').trim().replace(/^(re|rv|fwd|fw)\s*:\s*/i, '');

  // Formatos soportados (case-insensitive):
  // [GEPAC] Título
  // GEPAC: Título
  // GEPAC - Título
  // GEPAC título
  // Editorial GEPAC título
  let m = v.match(/^\s*editorial\s+(gepac|aeal)\s+(.+)$/i);
  if (m) return { editorial: m[1], title: m[2].trim() };

  m = v.match(/^\s*\[(gepac|aeal)\]\s*(.+)$/i);
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
  // Preferimos extraer cuerpo preservando saltos de línea
  const bodyRawMatch = src.match(/Cuerpo\s*:\s*([\s\S]+)$/i);
  out.body = bodyRawMatch ? bodyRawMatch[1].trim() : pick(compact, /Cuerpo\s*:\s*(.+)$/i);

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
function firstCleanSentence(text = '') {
  const parts = String(text).split(/\n\n+/).map((x) => x.trim()).filter(Boolean);
  for (const p of parts) {
    if (/^(De:|Enviado:|Para:|Asunto:)/i.test(p)) continue;
    if (/^(Serie\s+(GEPAC|AEAL)|Keywords?|Title\s*SEO|Meta\s*description|Firma editorial|Contenido elaborado por)/i.test(p)) continue;
    if (/^https?:\/\//i.test(p)) continue;
    if (p.length < 40) continue;
    return firstSentence(p);
  }
  return firstSentence(String(text));
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
  let raw = String(src || '');

  // Corta bloques de instrucciones internas/SEO/redes que no deben publicarse
  const stopMarkers = [
    'Documento de optimización SEO editorial',
    'Informe operativo para despliegue en redes sociales',
    'Material de publicación listo para usar',
  ];
  let cut = raw.length;
  for (const marker of stopMarkers) {
    const i = raw.indexOf(marker);
    if (i >= 0 && i < cut) cut = i;
  }
  raw = raw.slice(0, cut);

  const lines = raw
    .replace(/<(https?:\/\/[^>\s]+)>/g, ' $1 ')
    .replace(/([A-Za-zÁ-ÿ0-9])(?=https?:\/\/)/g, '$1 ')
    .replace(/_{3,}/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .split(/\r?\n/)
    .map((ln) => ln.replace(/^>+\s*/, '').trim())
    .map((ln) => {
      if (!ln) return '';
      if (/^\s*(De:|Enviado:|Para:|Asunto:)\b/i.test(ln)) return null;
      if (/^\s*Serie\s+(GEPAC|AEAL)\b/i.test(ln)) return null;
      if (/^\s*(Keywords?|Title\s*SEO|Meta\s*description|Firma editorial|Contenido elaborado por)\b/i.test(ln)) return null;
      if (/^\s*[•\-*]\s+/.test(ln)) return null;
      if (/^https?:\/\//i.test(ln)) return null;
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ln)) return null;
      return ln;
    })
    .filter((ln) => ln !== null);

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderBodyHtml(content = '') {
  let blocks = String(content)
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (blocks.length <= 1) {
    blocks = autoParagraphize(blocks[0] || String(content || ''));
  }

  const out = [];
  for (const b of blocks) {
    const injected = inferSubtitleBeforeParagraph(b);
    if (injected) {
      out.push(`<h2 style="margin:20px 0 8px;font-size:1.15rem;line-height:1.35">${autoLinkUrls(escapeHTML(injected))}</h2>`);
    }

    if (isSubtitleBlock(b)) {
      out.push(`<h2 style="margin:20px 0 8px;font-size:1.15rem;line-height:1.35">${autoLinkUrls(escapeHTML(stripEndingColon(b)))}</h2>`);
    } else {
      out.push(`<p>${autoLinkUrls(escapeHTML(b))}</p>`);
    }
  }

  return out.join('\n');
}

function autoParagraphize(text = '') {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length <= 2) return [clean];

  const out = [];
  let buf = '';
  let count = 0;
  for (const s of sentences) {
    const candidate = (buf ? `${buf} ${s}` : s).trim();
    if (candidate.length > 420 || count >= 2) {
      if (buf) out.push(buf.trim());
      buf = s;
      count = 1;
    } else {
      buf = candidate;
      count += 1;
    }
  }
  if (buf) out.push(buf.trim());
  return out;
}

function isSubtitleBlock(text = '') {
  const t = String(text).trim();
  if (!t) return false;
  if (t.length > 95) return false;
  if (/^[A-ZÁÉÍÓÚÑ0-9][^.!?]{2,}:$/.test(t)) return true;
  const words = t.split(/\s+/).length;
  return words >= 2 && words <= 10 && !/[.!?]$/.test(t) && /^[A-ZÁÉÍÓÚÑ]/.test(t);
}

function stripEndingColon(text = '') {
  return String(text).replace(/:\s*$/, '').trim();
}

function inferSubtitleBeforeParagraph(paragraph = '') {
  const p = String(paragraph || '');
  const rules = [
    [/^Uno de los ámbitos en los que esta utilidad resulta más evidente/i, 'Gestión de la información y atención al paciente'],
    [/^La tecnología también ha cambiado la forma en que las asociaciones/i, 'Información fiable y acceso digital'],
    [/^Junto a ello, la digitalización ha ampliado enormemente/i, 'Acompañamiento a distancia'],
    [/^También las comunidades de pacientes se han visto fortalecidas/i, 'Comunidad y apoyo emocional'],
    [/^Ahora bien, la incorporación de la tecnología/i, 'Privacidad y responsabilidad'],
    [/^Por eso conviene abandonar una idea simplificada/i, 'Tecnología al servicio de la misión'],
  ];
  for (const [re, heading] of rules) {
    if (re.test(p)) return heading;
  }
  return '';
}

function reviewQuality({ summary = '', content = '', bodyText = '', title = '' }) {
  const issues = [];
  const combined = `${summary}\n${content}\n${bodyText}`;

  if (!title || title.trim().length < 8) issues.push('Título demasiado corto o vacío');
  if (!summary || summary.trim().length < 70) issues.push('Resumen demasiado corto');
  if (!content || content.trim().length < 400) issues.push('Contenido demasiado corto');

  const badPatterns = [
    /\bDe:\s/i,
    /\bEnviado:\s/i,
    /\bPara:\s/i,
    /\bAsunto:\s/i,
    /\bKeywords?\b/i,
    /\bTitle\s*SEO\b/i,
    /\bMeta\s*description\b/i,
    /\bFirma editorial\b/i,
  ];
  if (badPatterns.some((re) => re.test(combined))) issues.push('Texto interno/encabezado detectado');

  return { ok: issues.length === 0, issues };
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
${renderBodyHtml(content)}
${articleImageEnd ? `<p><img src="${escapeHTML(articleImageEnd)}" alt="${escapeHTML(title)}" style="width:100%;max-width:760px;border-radius:10px;margin:16px 0 0;border:1px solid #ddd"/></p>` : ''}
</div>
</body></html>`;

  fs.writeFileSync(filePath, html);
  return relUrl;
}
function upsertPost(post) {
  const pth = path.join(ROOT, 'data', 'posts.json');
  const posts = JSON.parse(fs.readFileSync(pth, 'utf8'));
  const id = `${post.editorial.toLowerCase()}-${post.date}-${slugify(post.title)}`;

  // evita duplicados por id (mismo editorial+fecha+slug)
  const filtered = posts.filter((p) => p.id !== id);

  filtered.unshift({
    id,
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
  filtered.sort((a,b)=> new Date(b.date)-new Date(a.date));
  fs.writeFileSync(pth, JSON.stringify(filtered, null, 2));
}
function syncPostsJs() {
  const posts = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'posts.json'), 'utf8'));
  fs.writeFileSync(path.join(ROOT, 'data', 'posts.js'), `window.POSTS = ${JSON.stringify(posts, null, 2)};\n`);
}

function appendAuthorshipLog({ editorial = '', senderEmail = '', author = '', title = '', threadId = '' }) {
  const p = path.join(ROOT, 'data', 'control_autoria.csv');
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, 'fecha,hora,editor,email_remitente,autor_detectado,titulo,thread_id\n');
  }

  const { date, time } = madridDateTime();
  const row = [
    csv(date),
    csv(time),
    csv(editorial),
    csv(senderEmail),
    csv(author),
    csv(title),
    csv(threadId),
  ].join(',') + '\n';

  fs.appendFileSync(p, row);
}

function appendMentionsLog({ editorial = '', title = '', threadId = '', text = '' }) {
  const p = path.join(ROOT, 'data', 'control_menciones.csv');
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, 'fecha,hora,editor,titulo,thread_id,tipo,entidad\n');
  }

  const mentions = detectMentions(text);
  if (!mentions.length) return;

  const { date, time } = madridDateTime();
  const rows = mentions
    .map((m) => [csv(date), csv(time), csv(editorial), csv(title), csv(threadId), csv(m.type), csv(m.name)].join(','))
    .join('\n') + '\n';
  fs.appendFileSync(p, rows);
}

function detectMentions(text = '') {
  const t = normalizeText(text);
  const catalog = [
    { type: 'farmaceutica', name: 'Sanofi' },
    { type: 'farmaceutica', name: 'Menarini' },
    { type: 'farmaceutica', name: 'Roche' },
    { type: 'farmaceutica', name: 'Novartis' },
    { type: 'farmaceutica', name: 'Pfizer' },
    { type: 'farmaceutica', name: 'AstraZeneca' },
    { type: 'farmaceutica', name: 'BMS' },
    { type: 'farmaceutica', name: 'MSD' },
    { type: 'farmaceutica', name: 'GSK' },
    { type: 'farmaceutica', name: 'Janssen' },
    { type: 'asociacion', name: 'GEPAC' },
    { type: 'asociacion', name: 'AEAL' },
    { type: 'asociacion', name: 'Fundación Sandra Ibarra' },
    { type: 'asociacion', name: 'CRIS' },
    { type: 'entidad', name: 'UAM' },
    { type: 'entidad', name: 'URJC' },
    { type: 'entidad', name: 'UCM' },
  ];

  const out = [];
  for (const c of catalog) {
    const key = normalizeText(c.name);
    const re = new RegExp(`\\b${escapeRegExp(key)}\\b`);
    if (re.test(t)) out.push(c);
  }
  return out;
}

function normalizeText(s = '') {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function escapeRegExp(s = '') {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function madridDateTime() {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const get = (t) => fmt.find((x) => x.type === t)?.value || '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
  };
}

function csv(v = '') {
  const s = String(v ?? '').replaceAll('"', '""');
  return `"${s}"`;
}
function loadDrafts() {
  const p = path.join(ROOT, 'data', 'drafts.json');
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; }
}

function loadProcessedThreads() {
  const p = path.join(ROOT, 'data', 'processed-threads.json');
  if (!fs.existsSync(p)) return new Set();
  try {
    const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function markThreadProcessed(id) {
  const p = path.join(ROOT, 'data', 'processed-threads.json');
  const current = Array.from(loadProcessedThreads());
  if (!current.includes(id)) current.unshift(id);
  const trimmed = current.slice(0, 500);
  fs.writeFileSync(p, JSON.stringify(trimmed, null, 2));
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
function writePublisherStatus({ processed, errors }) {
  const status = {
    lastRun: new Date().toISOString(),
    published: processed,
    message: processed > 0 ? 'Publicación completada correctamente' : 'No había entradas nuevas para publicar',
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

function autoGitPublish(processed) {
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
      run(`git commit -m "Auto flow: ${processed} publish (${stamp})"`);
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

function autoLinkUrls(htmlSafeText = '') {
  return String(htmlSafeText).replace(
    /(https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+)/g,
    (m, url) => {
      let label = url;
      try {
        const host = new URL(url).hostname.replace(/^www\./, '');
        label = host;
      } catch {}
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#0a66cc;text-decoration:underline;text-underline-offset:2px;font-weight:600;">${label}</a>`;
    }
  );
}

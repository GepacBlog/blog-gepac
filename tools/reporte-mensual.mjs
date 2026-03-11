#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const dataDir = path.join(ROOT, 'data');
const reportsDir = path.join(ROOT, 'reports');
fs.mkdirSync(reportsDir, { recursive: true });

const target = process.argv[2] || previousMonth(); // YYYY-MM
const [yy, mm] = target.split('-');
if (!yy || !mm) {
  console.log('Uso: node tools/reporte-mensual.mjs [YYYY-MM]');
  process.exit(1);
}

const autoria = readCsv(path.join(dataDir, 'control_autoria.csv'));
const menciones = readCsv(path.join(dataDir, 'control_menciones.csv'));
const posts = JSON.parse(fs.readFileSync(path.join(dataDir, 'posts.json'), 'utf8'));

let monthRows = autoria.filter((r) => String(r.fecha || '').startsWith(`${yy}-${mm}`));
const mencRows = menciones.filter((r) => String(r.fecha || '').startsWith(`${yy}-${mm}`));
const monthPosts = posts.filter((p) => String(p.date || '').startsWith(`${yy}-${mm}`));

// Fallback para meses previos sin log de autoría histórico
if (monthRows.length === 0 && monthPosts.length > 0) {
  monthRows = monthPosts.map((p) => ({
    fecha: p.date,
    hora: '00:00:00',
    editor: p.editorial,
    email_remitente: '(sin email histórico)',
    autor_detectado: p.author || '',
    titulo: p.title,
    thread_id: p.id,
  }));
}

const total = monthRows.length;
const byEditor = countBy(monthRows, 'editor');
const byEmail = countBy(monthRows, 'email_remitente');
const byType = countBy(mencRows, 'tipo');
const byEntity = countBy(mencRows, 'entidad');
const mentionDetails = buildMentionDetails(mencRows);
const mentionByArticle = buildMentionByArticle(mencRows);

const lines = [];
lines.push(`# Informe mensual blog · ${yy}-${mm}`);
lines.push('');
lines.push(`- Publicaciones registradas: **${total}**`);
lines.push(`- GEPAC: **${byEditor.GEPAC || 0}** · AEAL: **${byEditor.AEAL || 0}**`);
lines.push('');
lines.push('## Autoría (por email remitente)');
if (Object.keys(byEmail).length === 0) lines.push('- Sin datos');
else for (const [k, v] of topEntries(byEmail, 20)) lines.push(`- ${k}: ${v}`);

lines.push('');
lines.push('## Menciones (auditoría patrocinadores)');
if (mencRows.length === 0) {
  lines.push('- Sin menciones detectadas');
} else {
  lines.push(`- Total menciones detectadas: **${mencRows.length}**`);
  lines.push(`- Farmacéuticas: **${byType.farmaceutica || 0}** · Asociaciones: **${byType.asociacion || 0}** · Entidades: **${byType.entidad || 0}**`);
  lines.push('');
  lines.push('### Top entidades mencionadas');
  for (const [k, v] of topEntries(byEntity, 25)) lines.push(`- ${k}: ${v}`);
  lines.push('');
  lines.push('### Detalle por artículo');
  for (const a of mentionByArticle.slice(0, 200)) {
    lines.push(`- **${a.titulo}** (${a.fecha})`);
    lines.push(`  - Entidades mencionadas: ${a.entidades.join(', ')}`);
  }
}

const reportMd = lines.join('\n') + '\n';
const outPath = path.join(reportsDir, `informe-${yy}-${mm}.md`);
fs.writeFileSync(outPath, reportMd);

// CSV resumen mensual para Excel
const csvPath = path.join(reportsDir, `informe-${yy}-${mm}.csv`);
const csv = [
  'periodo,publicaciones_total,gepac,aeal,menciones_total,menciones_farmaceuticas,menciones_asociaciones,menciones_entidades',
  `${yy}-${mm},${total},${byEditor.GEPAC || 0},${byEditor.AEAL || 0},${mencRows.length},${byType.farmaceutica || 0},${byType.asociacion || 0},${byType.entidad || 0}`,
].join('\n') + '\n';
fs.writeFileSync(csvPath, csv);

// JSON intermedio para generar PDF de auditoría
const jsonPath = path.join(reportsDir, `informe-${yy}-${mm}.json`);
const summary = {
  period: `${yy}-${mm}`,
  total,
  byEditor,
  byEmail,
  byType,
  byEntity,
  mentionDetails,
  mentionByArticle,
  posts: monthPosts.map((p) => ({ date: p.date, editorial: p.editorial, title: p.title })),
};
fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));

let pdfPath = '';
try {
  const py = path.join(ROOT, '.venv', 'bin', 'python');
  const pdfOut = exec(`"${py}" tools/reporte-mensual-pdf.py "${jsonPath}"`).trim();
  pdfPath = pdfOut;
} catch (e) {
  // fallback: sin PDF, mantener md/csv
}

console.log(`Informe mensual generado: ${outPath}`);
console.log(`CSV resumen: ${csvPath}`);
if (pdfPath) console.log(`PDF auditoría: ${pdfPath}`);
console.log(`Publicaciones: ${total} | GEPAC ${byEditor.GEPAC || 0} | AEAL ${byEditor.AEAL || 0}`);
console.log(`Menciones: total ${mencRows.length} | farma ${byType.farmaceutica || 0} | asociacion ${byType.asociacion || 0} | entidad ${byType.entidad || 0}`);

function previousMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function readCsv(file) {
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, 'utf8').trim();
  if (!raw) return [];
  const [header, ...rows] = raw.split(/\r?\n/);
  const cols = parseCsvLine(header);
  return rows.map((r) => {
    const vals = parseCsvLine(r);
    const o = {};
    cols.forEach((c, i) => (o[c] = vals[i] || ''));
    return o;
  });
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (ch === ',' && !q) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function countBy(rows, key) {
  const m = {};
  for (const r of rows) {
    const k = (r[key] || '').trim() || '(vacío)';
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}

function topEntries(obj, limit = 10) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function buildMentionDetails(rows) {
  return rows
    .map((r) => ({
      fecha: (r.fecha || '').trim(),
      tipo: (r.tipo || '').trim(),
      entidad: (r.entidad || '').trim(),
      titulo: (r.titulo || '').trim(),
    }))
    .sort((a, b) => {
      if (a.entidad !== b.entidad) return a.entidad.localeCompare(b.entidad, 'es');
      if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
      return a.titulo.localeCompare(b.titulo, 'es');
    });
}

function buildMentionByArticle(rows) {
  const map = new Map();
  for (const r of rows) {
    const title = (r.titulo || '').trim();
    const date = (r.fecha || '').trim();
    const key = `${date}::${title}`;
    if (!map.has(key)) {
      map.set(key, { fecha: date, titulo: title, entidades: new Set() });
    }
    map.get(key).entidades.add((r.entidad || '').trim());
  }

  return Array.from(map.values())
    .map((x) => ({
      fecha: x.fecha,
      titulo: x.titulo,
      entidades: Array.from(x.entidades).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es')),
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function exec(cmd) {
  return execSync(cmd, { encoding: 'utf8' });
}

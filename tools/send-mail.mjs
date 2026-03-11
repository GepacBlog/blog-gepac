#!/usr/bin/env node
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const account = process.env.BLOG_MAIL_ACCOUNT || 'agentekrok@gmail.com';
const args = process.argv.slice(2);

const getArg = (name) => {
  const prefix = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : '';
};

const to = getArg('to');
const subject = getArg('subject');
const body = getArg('body');
const cc = getArg('cc');
const bcc = getArg('bcc');
const attach = getArg('attach'); // coma-separado
const from = getArg('from');
const replyTo = getArg('reply-to');
const html = args.includes('--html');
const corpTemplate = args.includes('--corp-template');
const dry = args.includes('--dry-run');

if (!to || !subject || !body) {
  console.log('Uso: node tools/send-mail.mjs --to=email@dominio.com --subject="Asunto" --body="Texto" [--cc=a@x.com] [--bcc=b@y.com] [--attach=/ruta/a.pdf,/ruta/b.png] [--html] [--corp-template] [--from=alias@dominio.com] [--reply-to=reply@dominio.com] [--dry-run]');
  process.exit(1);
}

const esc = (v = '') => `'${String(v).replace(/'/g, `'\\''`)}'`;

const bodyHtml = corpTemplate
  ? `<div style="font-family:Inter,Arial,sans-serif;line-height:1.55;color:#1f2533"><p>${String(body).replace(/\n/g, '<br/>')}</p><hr style="border:none;border-top:1px solid #e1e6f0;margin:16px 0"/><p style="font-size:12px;color:#667085">Equipo Krokland · Comunicación</p></div>`
  : String(body).replace(/\n/g, '<br/>');

let cmd = `gog gmail send --account ${esc(account)} --to ${esc(to)} --subject ${esc(subject)} --no-input`;
cmd += html || corpTemplate ? ` --body-html ${esc(bodyHtml)}` : ` --body ${esc(body)}`;
if (cc) cmd += ` --cc ${esc(cc)}`;
if (bcc) cmd += ` --bcc ${esc(bcc)}`;
if (from) cmd += ` --from ${esc(from)}`;
if (replyTo) cmd += ` --reply-to ${esc(replyTo)}`;

if (attach) {
  const files = attach.split(',').map((x) => x.trim()).filter(Boolean);
  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.error(`Adjunto no encontrado: ${f}`);
      process.exit(2);
    }
    cmd += ` --attach ${esc(f)}`;
  }
}

if (dry) cmd += ' --dry-run';

const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
console.log(out.trim());

#!/usr/bin/env node
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
const dry = args.includes('--dry-run');

if (!to || !subject || !body) {
  console.log('Uso: node tools/send-mail.mjs --to=email@dominio.com --subject="Asunto" --body="Texto" [--cc=a@x.com] [--bcc=b@y.com] [--dry-run]');
  process.exit(1);
}

const esc = (v='') => `'${String(v).replace(/'/g, `'\\''`)}'`;
let cmd = `gog gmail send --account ${esc(account)} --to ${esc(to)} --subject ${esc(subject)} --body ${esc(body)} --no-input`;
if (cc) cmd += ` --cc ${esc(cc)}`;
if (bcc) cmd += ` --bcc ${esc(bcc)}`;
if (dry) cmd += ' --dry-run';

const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
console.log(out.trim());

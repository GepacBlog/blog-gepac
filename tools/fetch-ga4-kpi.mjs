#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PROPERTY_ID = process.env.GA4_PROPERTY_ID || '528211346';
const KEY_PATH = process.env.GA4_KEY_PATH || '/Users/krokland/Downloads/ga4-blog-gepac-5805b7b5ee6f.json';
const OUT_PATH = process.env.GA4_OUT_PATH || path.join(process.cwd(), 'data', 'ga4-kpi.json');

const key = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = sign.sign(key.private_key);
  const jwt = `${unsigned}.${b64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`Token error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function runReport(token, body) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`runReport ${res.status}: ${await res.text()}`);
  return await res.json();
}

function parseRows(rows = []) {
  return rows.map((r) => ({
    dims: (r.dimensionValues || []).map((d) => d.value),
    mets: (r.metricValues || []).map((m) => Number(m.value || 0)),
  }));
}

async function main() {
  const token = await getAccessToken();

  const baseDate = [
    { startDate: '30daysAgo', endDate: 'today' },
  ];

  const viewsReport = await runReport(token, {
    dateRanges: baseDate,
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      andGroup: {
        expressions: [
          { filter: { fieldName: 'eventName', stringFilter: { value: 'visualizacion' } } },
          { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'CONTAINS', value: '/blog-gepac/' } } },
        ],
      },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 50,
  });

  const sessionsReport = await runReport(token, {
    dateRanges: baseDate,
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'userEngagementDuration' },
    ],
    dimensionFilter: {
      filter: { fieldName: 'pagePath', stringFilter: { matchType: 'CONTAINS', value: '/blog-gepac/' } },
    },
  });

  const viewRows = parseRows(viewsReport.rows || []).map((r) => ({ pagePath: r.dims[0], views: r.mets[0] }));
  const total = (sessionsReport.rows?.[0]?.metricValues || []).map((m) => Number(m.value || 0));

  const out = {
    generatedAt: new Date().toISOString(),
    propertyId: PROPERTY_ID,
    period: 'last30days',
    sessions: total[0] || 0,
    users: total[1] || 0,
    engagementSeconds: Math.round(total[2] || 0),
    topPagesByViews: viewRows,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`GA4 KPI guardado en ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

const posts = (window.POSTS || []).map(p => ({ ...p, dateObj: new Date(p.date) }));
const year = new Date().getFullYear();
const yearPosts = posts.filter(p => p.dateObj.getFullYear() === year);

const gepac = yearPosts.filter(p => p.editorial === 'GEPAC').length;
const aeal = yearPosts.filter(p => p.editorial === 'AEAL').length;

const grid = document.getElementById('metrics-grid');
grid.innerHTML = `
  <div class="metric-card"><div class="metric-label">Total publicaciones (${year})</div><div class="metric-value">${yearPosts.length}</div></div>
  <div class="metric-card"><div class="metric-label">Editorial GEPAC</div><div class="metric-value">${gepac}</div></div>
  <div class="metric-card"><div class="metric-label">Editorial AEAL</div><div class="metric-value">${aeal}</div></div>
`;

const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const monthly = new Map();
for (const p of yearPosts) {
  const m = p.dateObj.getMonth();
  if (!monthly.has(m)) monthly.set(m, { total: 0, gepac: 0, aeal: 0 });
  const row = monthly.get(m);
  row.total += 1;
  if (p.editorial === 'GEPAC') row.gepac += 1;
  if (p.editorial === 'AEAL') row.aeal += 1;
}

const tbody = document.getElementById('monthly-body');
const rows = Array.from(monthly.entries())
  .sort((a,b)=>b[0]-a[0])
  .map(([m,v]) => `<tr><td>${monthNames[m]}</td><td>${v.total}</td><td>${v.gepac}</td><td>${v.aeal}</td></tr>`)
  .join('');

if (!rows) {
  tbody.innerHTML = `<tr><td colspan="4">Sin publicaciones este año.</td></tr>`;
} else {
  tbody.innerHTML = rows;
}

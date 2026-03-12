const form = document.getElementById('search-form');
const input = document.getElementById('search-input');
const results = document.getElementById('search-results');
const btnAll = document.getElementById('search-filter-all');
const btnGepac = document.getElementById('search-filter-gepac');
const btnAeal = document.getElementById('search-filter-aeal');

const posts = (window.POSTS || []).map((p) => ({ ...p, dateObj: new Date(p.date) }));
let currentFilter = 'ALL';

render([]);

const params = new URLSearchParams(location.search);
const q = (params.get('q') || '').trim();
if (q) {
  input.value = q;
  runSearch(q);
}

form?.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = input.value.trim();
  const url = new URL(location.href);
  if (q) url.searchParams.set('q', q);
  else url.searchParams.delete('q');
  history.replaceState(null, '', url.toString());
  runSearch(q);
});

btnAll?.addEventListener('click', () => { currentFilter = 'ALL'; setActive(); runSearch(input.value.trim()); });
btnGepac?.addEventListener('click', () => { currentFilter = 'GEPAC'; setActive(); runSearch(input.value.trim()); });
btnAeal?.addEventListener('click', () => { currentFilter = 'AEAL'; setActive(); runSearch(input.value.trim()); });

function setActive() {
  [btnAll, btnGepac, btnAeal].forEach((b) => b?.classList.remove('active'));
  if (currentFilter === 'ALL') btnAll?.classList.add('active');
  if (currentFilter === 'GEPAC') btnGepac?.classList.add('active');
  if (currentFilter === 'AEAL') btnAeal?.classList.add('active');
}

function runSearch(q) {
  const query = q.toLowerCase();
  if (!query) return render([]);

  const found = posts
    .filter((p) => {
      if (currentFilter !== 'ALL' && p.editorial !== currentFilter) return false;
      const bag = `${p.title} ${p.summary} ${p.editorial} ${p.author || ''} ${p.category || ''}`.toLowerCase();
      return bag.includes(query);
    })
    .sort((a, b) => b.dateObj - a.dateObj);

  render(found, q);
}

function render(list, query = '') {
  if (!query) {
    results.innerHTML = `<p class="empty">Escribe un término y pulsa Buscar.</p>`;
    return;
  }
  if (!list.length) {
    results.innerHTML = `<p class="empty">Sin resultados para "${escapeHTML(query)}" con el filtro actual.</p>`;
    return;
  }

  results.innerHTML = list
    .map((p) => {
      const cssClass = p.editorial === 'GEPAC' ? 'gepac' : 'aeal';
      return `
      <article class="news-card ${cssClass}">
        <img class="thumb" src="${p.image}" alt="${escapeHTML(p.title)}" />
        <div>
          <div class="meta"><span>${p.date}</span><span class="age-badge">Editorial ${escapeHTML(p.editorial)}</span></div>
          <h3>${escapeHTML(p.title)}</h3>
          <p>${escapeHTML(p.summary)}</p>
          <a class="read-more" href="${p.url}">Leer más</a>
        </div>
      </article>`;
    })
    .join('');
}

function escapeHTML(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

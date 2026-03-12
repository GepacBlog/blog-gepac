const listHome = document.getElementById("list-home");
const featuredHome = document.getElementById("featured-home");
const mostRead = document.getElementById("most-read");
const publishStatus = document.getElementById("publish-status");

const now = new Date();
const params = new URLSearchParams(location.search);
const editorialFilter = (params.get('ed') || 'all').toLowerCase();

init();

async function init() {
  try {
    let posts = Array.isArray(window.POSTS) ? window.POSTS : null;

    if (!posts) {
      const r = await fetch("./data/posts.json");
      posts = await r.json();
    }

    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    let latestMonthPosts = posts
      .map((p, i) => ({ ...normalizePost(p, i), dateObj: new Date(p.date) }))
      .filter((p) => isWithinLastNDays(p.date, 30))
      .filter((p) => p.dateObj.getMonth() === currentMonth && p.dateObj.getFullYear() === currentYear)
      .sort((a, b) => b.dateObj - a.dateObj);

    if (editorialFilter === 'gepac' || editorialFilter === 'aeal') {
      latestMonthPosts = latestMonthPosts.filter((p) => p.editorial.toLowerCase() === editorialFilter);
    }

    renderPublishStatus();
    setNavState();

    if (!latestMonthPosts.length) {
      listHome.innerHTML = `<p class="empty">Sin noticias del último mes.</p>`;
      featuredHome.innerHTML = "";
      mostRead.innerHTML = "";
      return;
    }

    const [featured, ...rest] = latestMonthPosts;
    renderFeatured(featured);
    renderList(rest, listHome);
    renderMostRead(latestMonthPosts.slice(0, 5));
  } catch {
    listHome.innerHTML = `<p class="empty">No se pudieron cargar noticias.</p>`;
  }
}

function normalizePost(p, i) {
  const defaultCategory = p.editorial === "GEPAC" ? "GEPAC" : "AEAL";
  return {
    ...p,
    author: p.author || (p.editorial === "GEPAC" ? "Equipo GEPAC" : "Equipo AEAL"),
    category: p.category || defaultCategory,
    comments: typeof p.comments === "number" ? p.comments : 0,
    views: typeof p.views === "number" ? p.views : Math.max(80, 420 - i * 17),
  };
}

function renderFeatured(p) {
  featuredHome.innerHTML = `
    <article class="featured-card ${p.editorial === "GEPAC" ? "gepac" : "aeal"}">
      <img src="${p.image}" alt="${escapeHTML(p.title)}" />
      <div>
        <div class="meta"><span>${p.date}</span><span class="read-time">${readingTime(p)} min lectura</span></div>
        <h3><span class="editorial-pill ${p.editorial === "GEPAC" ? "pill-gepac" : "pill-aeal"}">${escapeHTML(p.editorial)}</span> ${escapeHTML(p.title)}</h3>
        <p>${escapeHTML(p.summary)}</p>
        <a class="read-more" href="${p.url}">Leer más</a>
        <div class="age-bottom">${ageLabel(p.dateObj)}</div>
      </div>
    </article>
  `;
}

function renderList(posts, mountNode) {
  mountNode.innerHTML = posts
    .map((p) => {
      const cssClass = p.editorial === "GEPAC" ? "gepac" : "aeal";
      return `
      <article class="news-card ${cssClass}">
        <img class="thumb" src="${p.image}" alt="${escapeHTML(p.title)}" />
        <div>
          <div class="meta"><span>${p.date}</span><span class="read-time">${readingTime(p)} min lectura</span></div>
          <h3><span class="editorial-pill ${p.editorial === "GEPAC" ? "pill-gepac" : "pill-aeal"}">${escapeHTML(p.editorial)}</span> ${escapeHTML(p.title)}</h3>
          <p>${escapeHTML(p.summary)}</p>
          <a class="read-more" href="${p.url}">Leer más</a>
          <div class="card-footer">
            <span>${escapeHTML(p.category)}</span>
            <span>${escapeHTML(p.author)}</span>
            <span>${p.comments} comentarios</span>
          </div>
          <div class="age-bottom">${ageLabel(p.dateObj)}</div>
        </div>
      </article>
    `;
    })
    .join("");
}

function renderMostRead(posts) {
  mostRead.innerHTML = posts
    .slice()
    .sort((a, b) => b.views - a.views)
    .map(
      (p) => `<li><a href="${p.url}">${escapeHTML(
        p.title
      )}</a></li>`
    )
    .join("");
}

function renderPublishStatus() {
  if (!publishStatus) return;
  const s = window.PUBLISH_STATUS || {};
  const lastRun = s.lastRun ? new Date(s.lastRun).toLocaleString('es-ES') : 'sin ejecutar';
  const published = Number(s.published || 0);
  const cls = published > 0 ? 'status-ok' : 'status-warn';
  publishStatus.innerHTML = `
    <div><strong>Última ejecución:</strong> ${lastRun}</div>
    <div class="${cls}">Publicadas: ${published}</div>
    <div>${escapeHTML(s.message || '')}</div>
  `;
}

function setNavState() {
  const all = document.getElementById('nav-all');
  const gepac = document.getElementById('nav-gepac');
  const aeal = document.getElementById('nav-aeal');
  if (editorialFilter !== 'gepac' && editorialFilter !== 'aeal') all?.classList.add('active-nav');
  if (editorialFilter === 'gepac') gepac?.classList.add('active-nav');
  if (editorialFilter === 'aeal') aeal?.classList.add('active-nav');
}

function ageLabel(dateObj) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateObj);
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.max(0, Math.floor((today - d) / 86400000));

  if (diffDays === 0) return "Noticia de hoy";
  if (diffDays === 1) return "Noticia de hace 1 día";
  return `Noticia de hace ${diffDays} días`;
}

function readingTime(p) {
  const words = `${p.title || ''} ${p.summary || ''}`.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

function isWithinLastNDays(dateISO, days = 30) {
  const [y, m, d] = String(dateISO).split('-').map(Number);
  const article = new Date(y, (m || 1) - 1, d || 1);
  article.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((today - article) / 86400000);
  return diffDays >= 0 && diffDays <= days;
}

function escapeHTML(str = "") {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

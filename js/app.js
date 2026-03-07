const listHome = document.getElementById("list-home");
const featuredHome = document.getElementById("featured-home");
const mostRead = document.getElementById("most-read");
const publishStatus = document.getElementById("publish-status");

const now = new Date();
const monthAgo = new Date(now);
monthAgo.setMonth(monthAgo.getMonth() - 1);
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

    let latestMonthPosts = posts
      .map((p, i) => ({ ...normalizePost(p, i), dateObj: new Date(p.date) }))
      .filter((p) => p.dateObj >= monthAgo && p.dateObj <= now)
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
    renderList(rest.length ? rest : [featured], listHome);
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
        <div class="meta"><span>${p.date}</span><span class="age-badge">${ageLabel(p.dateObj)}</span></div>
        <h3>Editorial ${escapeHTML(p.editorial)} · ${escapeHTML(p.title)}</h3>
        <p>${escapeHTML(p.summary)}</p>
        <a class="read-more" href="${p.url}" target="_blank" rel="noopener noreferrer">...Leer más</a>
        <div class="card-footer">
          <span>${escapeHTML(p.category)}</span>
          <span>${escapeHTML(p.author)}</span>
          <span>${p.comments} comentarios</span>
        </div>
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
          <div class="meta"><span>${p.date}</span><span class="age-badge">${ageLabel(p.dateObj)}</span></div>
          <h3>Editorial ${escapeHTML(p.editorial)} · ${escapeHTML(p.title)}</h3>
          <p>${escapeHTML(p.summary)}</p>
          <a class="read-more" href="${p.url}" target="_blank" rel="noopener noreferrer">...Leer más</a>
          <div class="card-footer">
            <span>${escapeHTML(p.category)}</span>
            <span>${escapeHTML(p.author)}</span>
            <span>${p.comments} comentarios</span>
          </div>
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
      (p) => `<li><a href="${p.url}" target="_blank" rel="noopener noreferrer">${escapeHTML(
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

function escapeHTML(str = "") {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

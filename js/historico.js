const listHistory = document.getElementById("list-history");
const btnAll = document.getElementById("filter-all");
const btnGepac = document.getElementById("filter-gepac");
const btnAeal = document.getElementById("filter-aeal");

let cachedHistoryPosts = [];
let currentFilter = "ALL";

init();

async function init() {
  try {
    let posts = Array.isArray(window.POSTS) ? window.POSTS : null;
    if (!posts) {
      const r = await fetch("./data/posts.json");
      posts = await r.json();
    }

    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);

    cachedHistoryPosts = posts
      .map((p) => ({ ...p, dateObj: new Date(p.date) }))
      .filter((p) => p.dateObj >= yearStart && !isWithinLastNDays(p.date, 30))
      .sort((a, b) => b.dateObj - a.dateObj);

    bindFilters();
    applyFilter("ALL");
  } catch {
    listHistory.innerHTML = `<p class="empty">No se pudieron cargar noticias.</p>`;
  }
}

function bindFilters() {
  btnAll?.addEventListener("click", () => applyFilter("ALL"));
  btnGepac?.addEventListener("click", () => applyFilter("GEPAC"));
  btnAeal?.addEventListener("click", () => applyFilter("AEAL"));
}

function applyFilter(filter) {
  currentFilter = filter;

  const posts =
    filter === "ALL"
      ? cachedHistoryPosts
      : cachedHistoryPosts.filter((p) => p.editorial === filter);

  renderGroupedByMonth(posts, listHistory);
  setActiveButton();
}

function setActiveButton() {
  [btnAll, btnGepac, btnAeal].forEach((b) => b?.classList.remove("active"));
  if (currentFilter === "ALL") btnAll?.classList.add("active");
  if (currentFilter === "GEPAC") btnGepac?.classList.add("active");
  if (currentFilter === "AEAL") btnAeal?.classList.add("active");
}

function renderGroupedByMonth(posts, mountNode) {
  if (!posts.length) {
    mountNode.innerHTML = `<p class="empty">No hay noticias para este filtro.</p>`;
    return;
  }

  const groups = new Map();
  for (const p of posts) {
    const key = `${p.dateObj.getFullYear()}-${String(p.dateObj.getMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const html = Array.from(groups.entries())
    .map(([key, monthPosts]) => {
      const [year, month] = key.split("-");
      const monthName = monthNameEs(Number(month));
      return `
        <section class="month-block">
          <h3 class="month-title">${monthName} ${year}</h3>
          <div class="news-list">
            ${monthPosts.map(renderCard).join("")}
          </div>
        </section>
      `;
    })
    .join("");

  mountNode.innerHTML = html;
}

function renderCard(p) {
  const cssClass = p.editorial === "GEPAC" ? "gepac" : "aeal";
  return `
    <article class="news-card ${cssClass}">
      <img class="thumb" src="${p.image}" alt="${escapeHTML(p.title)}" />
      <div>
        <div class="meta"><span>${p.date}</span></div>
        <h3>Editorial ${escapeHTML(p.editorial)} · ${escapeHTML(p.title)}</h3>
        <p>${escapeHTML(p.summary)}</p>
        <a class="read-more" href="${p.url}">...Leer más</a>
        <div class="age-bottom">${ageLabel(p.dateObj)}</div>
      </div>
    </article>
  `;
}

function monthNameEs(month) {
  const names = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  return names[month - 1] || "Mes";
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

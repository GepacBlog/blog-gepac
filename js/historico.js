const listHistory = document.getElementById("list-history");
const btnAll = document.getElementById("filter-all");
const btnGepac = document.getElementById("filter-gepac");
const btnAeal = document.getElementById("filter-aeal");
const btnLatest50 = document.getElementById("filter-latest-50");
const yearButtons = document.getElementById("year-buttons");
const monthButtons = document.getElementById("month-buttons");

let allPosts = [];
let currentEditorial = "ALL";
let currentYear = null;
let currentMonth = null;

init();

async function init() {
  try {
    let posts = Array.isArray(window.POSTS) ? window.POSTS : null;
    if (!posts) {
      const r = await fetch("./data/posts.json");
      posts = await r.json();
    }

    allPosts = posts
      .map((p) => ({ ...p, dateObj: new Date(p.date) }))
      .sort((a, b) => b.dateObj - a.dateObj);

    bindFilters();
    renderYearButtons();
    applyView({ latest50: true });
  } catch {
    listHistory.innerHTML = `<p class="empty">No se pudieron cargar noticias.</p>`;
  }
}

function bindFilters() {
  btnAll?.addEventListener("click", () => {
    currentEditorial = "ALL";
    applyView({ latest50: currentYear === null });
  });

  btnGepac?.addEventListener("click", () => {
    currentEditorial = "GEPAC";
    applyView({ latest50: currentYear === null });
  });

  btnAeal?.addEventListener("click", () => {
    currentEditorial = "AEAL";
    applyView({ latest50: currentYear === null });
  });

  btnLatest50?.addEventListener("click", () => {
    currentYear = null;
    currentMonth = null;
    renderMonthButtons();
    applyView({ latest50: true });
  });
}

function applyView({ latest50 = false } = {}) {
  let posts = applyEditorialFilter(allPosts);

  if (latest50) {
    posts = posts.slice(0, 50);
  } else if (currentYear !== null) {
    posts = posts.filter((p) => p.dateObj.getFullYear() === currentYear);
    if (currentMonth !== null) {
      posts = posts.filter((p) => p.dateObj.getMonth() + 1 === currentMonth);
    }
  }

  renderList(posts, listHistory);
  setActiveButtons();
}

function applyEditorialFilter(posts) {
  if (currentEditorial === "ALL") return posts;
  return posts.filter((p) => p.editorial === currentEditorial);
}

function renderYearButtons() {
  if (!yearButtons) return;
  const years = Array.from(new Set(allPosts.map((p) => p.dateObj.getFullYear()))).sort((a, b) => b - a);

  yearButtons.innerHTML = years
    .map(
      (year) => `<button class="filter-btn year-btn" data-year="${year}">${year}</button>`
    )
    .join("");

  yearButtons.querySelectorAll(".year-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentYear = Number(btn.dataset.year);
      currentMonth = null;
      renderMonthButtons();
      applyView({ latest50: false });
    });
  });
}

function renderMonthButtons() {
  if (!monthButtons) return;

  if (currentYear === null) {
    monthButtons.innerHTML = "";
    return;
  }

  let posts = allPosts.filter((p) => p.dateObj.getFullYear() === currentYear);
  posts = applyEditorialFilter(posts);

  const months = Array.from(new Set(posts.map((p) => p.dateObj.getMonth() + 1))).sort((a, b) => b - a);

  monthButtons.innerHTML = months
    .map(
      (m) => `<button class="filter-btn month-btn" data-month="${m}">${monthNameEs(m)}</button>`
    )
    .join("");

  monthButtons.querySelectorAll(".month-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentMonth = Number(btn.dataset.month);
      applyView({ latest50: false });
    });
  });
}

function setActiveButtons() {
  [btnAll, btnGepac, btnAeal, btnLatest50].forEach((b) => b?.classList.remove("active"));
  if (currentEditorial === "ALL") btnAll?.classList.add("active");
  if (currentEditorial === "GEPAC") btnGepac?.classList.add("active");
  if (currentEditorial === "AEAL") btnAeal?.classList.add("active");
  if (currentYear === null) btnLatest50?.classList.add("active");

  yearButtons?.querySelectorAll(".year-btn").forEach((b) => b.classList.remove("active"));
  if (currentYear !== null) {
    yearButtons?.querySelector(`[data-year="${currentYear}"]`)?.classList.add("active");
  }

  monthButtons?.querySelectorAll(".month-btn").forEach((b) => b.classList.remove("active"));
  if (currentMonth !== null) {
    monthButtons?.querySelector(`[data-month="${currentMonth}"]`)?.classList.add("active");
  }
}

function renderList(posts, mountNode) {
  if (!posts.length) {
    mountNode.innerHTML = `<p class="empty">No hay noticias para este filtro.</p>`;
    return;
  }

  mountNode.innerHTML = posts.map(renderCard).join("");
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
        <a class="read-more" href="${p.url}">Leer más</a>
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

function escapeHTML(str = "") {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

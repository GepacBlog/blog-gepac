(function () {
  function sendEvent(name, params = {}) {
    if (typeof window.gtag === 'function') {
      window.gtag('event', name, params);
    }
  }

  function safeText(el) {
    return (el?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  }

  // Evento base de página
  sendEvent('article_open', {
    page_path: location.pathname,
    page_title: document.title,
  });

  // Visualización explícita (útil para KPI de impacto)
  const h1 = document.querySelector('h1');
  sendEvent('visualizacion', {
    page_path: location.pathname,
    page_title: document.title,
    article_title: safeText(h1) || document.title,
  });

  // Click en enlaces de lectura
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('a');
    if (!a) return;
    const isReadMore = a.classList.contains('read-more') || /leer m[aá]s/i.test(safeText(a));
    if (!isReadMore) return;

    const card = a.closest('article, .news-card, .featured-card') || document;
    const title = safeText(card.querySelector('h3, h1')) || document.title;

    sendEvent('click_read_more', {
      page_path: location.pathname,
      target_path: a.getAttribute('href') || '',
      article_title: title,
    });
  });

  // Scroll 75%
  let sent75 = false;
  window.addEventListener('scroll', () => {
    if (sent75) return;
    const h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const y = window.scrollY + window.innerHeight;
    const ratio = h > 0 ? y / h : 0;
    if (ratio >= 0.75) {
      sent75 = true;
      sendEvent('scroll_75', {
        page_path: location.pathname,
        page_title: document.title,
      });
    }
  }, { passive: true });
})();

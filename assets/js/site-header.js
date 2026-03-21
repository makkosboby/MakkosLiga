
(() => {
  function getBasePath() {
    return '';
  }

  function buildHeader(currentPage) {
    const base = getBasePath();
    const links = [
      { href: 'index.html', label: 'Tabella', key: 'index' },
      { href: 'statisztikak.html', label: 'Statisztikák', key: 'stats' },
      { href: 'forum.html', label: 'Fórum', key: 'forum' },
      { href: 'bajnokaink.html', label: 'Bajnokaink', key: 'champions' }
    ];

    const linkHtml = links.map(link => {
      const active = currentPage === link.key ? ' mobile-link is-active' : ' mobile-link';
      return `<a class="${active.trim()}" href="${base}${link.href}">${link.label}</a>`;
    }).join('');

    return `
      <header class="site-header">
        <div class="header-inner">
          <div class="header-left">
            <a href="${base}index.html" class="header-logo-link" aria-label="Vissza a főoldalra">
              <img src="${base}assets/img/logo4.png" alt="Makkos Liga logo" class="logo-main">
            </a>
            <img src="${base}assets/img/kupa.png" alt="Kupa" class="logo-cup">
          </div>

          <div class="header-right nav">
            <button class="menu-btn" id="menuBtn" type="button" aria-expanded="false" aria-controls="mobileMenu">
              Menü
            </button>

            <div class="mobile-menu" id="mobileMenu" hidden>
              ${linkHtml}
              <a class="mobile-link admin-entry" href="${base}admin.html">Admin</a>
            </div>
          </div>
        </div>
      </header>
      <div class="accent-bar"></div>
    `;
  }

  function initMenu(root = document) {
    const menuBtn = root.getElementById ? root.getElementById('menuBtn') : document.getElementById('menuBtn');
    const mobileMenu = root.getElementById ? root.getElementById('mobileMenu') : document.getElementById('mobileMenu');
    if (!menuBtn || !mobileMenu) return;

    const closeMenu = () => {
      mobileMenu.hidden = true;
      menuBtn.setAttribute('aria-expanded', 'false');
    };

    const toggleMenu = () => {
      const willOpen = mobileMenu.hidden;
      mobileMenu.hidden = !willOpen;
      menuBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    };

    menuBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleMenu();
    });

    mobileMenu.addEventListener('click', (event) => event.stopPropagation());
    mobileMenu.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });
    window.addEventListener('resize', closeMenu);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const mount = document.getElementById('siteHeaderMount');
    if (!mount) return;
    const currentPage = document.body.dataset.page || 'index';
    mount.innerHTML = buildHeader(currentPage);
    initMenu(document);
  });
})();

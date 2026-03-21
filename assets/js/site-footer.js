(() => {
  function getBasePath() {
    return '';
  }

  function buildFooter() {
    const base = getBasePath();
    const year = new Date().getFullYear();

    return `
      <div class="footer-accent-bar"></div>
      <footer class="site-footer">
        <div class="footer-inner">
          <div class="footer-left">
            <div class="footer-title">Együttműködő partnereink</div>
            <div class="footer-partners" aria-label="Partnerek">
              <div class="partner-tile">
                <img src="${base}assets/img/szatmari.png" alt="Szatmári és Szatmári" class="partner-logo">
              </div>
              <div class="partner-tile">
                <img src="${base}assets/img/bernath.png" alt="Bernáth Fitness" class="partner-logo">
              </div>
              <div class="partner-tile">
                <img src="${base}assets/img/imiteto.png" alt="Imiteto" class="partner-logo">
              </div>
            </div>
            <div class="footer-note">© ${year} Makkos Liga</div>
          </div>

          <div class="footer-right">
            <img src="${base}assets/img/jatekosok.png" alt="Makkos Liga játékosok" class="footer-players">
          </div>
        </div>
      </footer>
    `;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const mount = document.getElementById('siteFooterMount');
    if (!mount) return;
    mount.innerHTML = buildFooter();
  });
})();

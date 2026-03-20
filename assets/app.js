(() => {
  const btn = document.getElementById("menuBtn");
  const menu = document.getElementById("mobileMenu");
  if (!btn || !menu) return;

  function closeMenu() {
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    btn.classList.remove("open");
  }

  function toggleMenu() {
    const willOpen = menu.hidden;
    menu.hidden = !willOpen;
    btn.setAttribute("aria-expanded", willOpen ? "true" : "false");

    if (willOpen) {
      btn.classList.add("open");
    } else {
      btn.classList.remove("open");
    }
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  menu.querySelectorAll("a").forEach(a =>
    a.addEventListener("click", closeMenu)
  );

  document.addEventListener("click", closeMenu);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  window.addEventListener("resize", closeMenu);
})();
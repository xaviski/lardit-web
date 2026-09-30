const menuButton = document.querySelector("[data-menu-button]");
const siteNav = document.querySelector("[data-site-nav]");
if (menuButton && siteNav) {
  menuButton.addEventListener("click", () => {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!isOpen));
    siteNav.dataset.open = String(!isOpen);
  });
  siteNav.addEventListener("click", (event) => {
    if (event.target.closest("a") && window.matchMedia("(max-width: 700px)").matches) {
      menuButton.setAttribute("aria-expanded", "false");
      siteNav.dataset.open = "false";
    }
  });
}
const notice = document.querySelector("[data-zero-notice]");
const noticeButton = document.querySelector("[data-dismiss-notice]");
if (notice && noticeButton) {
  noticeButton.addEventListener("click", () => { notice.hidden = true; });
}
const dateLabels = document.querySelectorAll("[data-current-date]");
dateLabels.forEach((dateLabel) => {
  dateLabel.textContent = new Intl.DateTimeFormat("ca-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(new Date());
});

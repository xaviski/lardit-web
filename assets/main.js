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

// The end-of-article links are the single source for the compact desktop rail.
// Keep them usable without JavaScript and never load a social-network widget.
function addArticleShareIcons(documentRoot) {
  const layout = documentRoot.querySelector(".article-layout");
  const share = layout?.querySelector(".article-body .article-share");
  if (!share || layout.querySelector(".article-share-icons")) return;

  const icons = {
    WhatsApp: [
      { d: "M20.5 11.7a8.5 8.5 0 0 1-12.6 7.5L3 20.5l1.3-4.8A8.5 8.5 0 1 1 20.5 11.7Z" },
      { d: "m8.1 7.4 1.5 2.7-1 1.1c.8 1.6 1.8 2.6 3.4 3.4l1.1-1 2.7 1.5c-.3 1.3-1.1 1.9-2.3 1.7-3.5-.6-6.7-3.8-7.3-7.3-.2-1.2.4-2 1.9-2.1Z" }
    ],
    X: [
      { d: "M3 3h4.4L21 21h-4.4Z", fill: "currentColor", stroke: "none" },
      { d: "m20 3-16 18", "stroke-width": "1.4" }
    ],
    Facebook: [
      { d: "M14 21v-8h3l.5-4H14V7.5c0-1.2.4-1.5 1.5-1.5H18V2h-3.5C11 2 9 4 9 7.5V9H6v4h3v8Z", fill: "currentColor", stroke: "none" }
    ],
    Correu: [
      { d: "M3 5h18v14H3Z" },
      { d: "m3 6 9 7 9-7" }
    ]
  };
  const sources = Array.from(share.querySelectorAll(".article-share__links a"));
  const channels = sources.map((source) => source.textContent.split("(")[0].trim());
  if (sources.length !== 4 || channels.some((channel) => !icons[channel])) return;

  const side = documentRoot.createElement("div");
  side.className = "article-side";
  const navigation = documentRoot.createElement("nav");
  navigation.className = "article-share-icons";
  navigation.setAttribute("aria-label", "Comparteix aquest article: opcions laterals");
  sources.forEach((source, index) => {
    const channel = channels[index];
    const link = documentRoot.createElement("a");
    link.setAttribute("href", source.getAttribute("href"));
    const label = channel === "Correu" ? "Comparteix per correu" : `Comparteix a ${channel}`;
    const opensNewTab = source.getAttribute("target") === "_blank";
    link.setAttribute("aria-label", label + (opensNewTab ? " (s’obre en una pestanya nova)" : ""));
    link.setAttribute("title", label);
    if (opensNewTab) {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    }

    const svg = documentRoot.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [name, value] of Object.entries({
      viewBox: "0 0 24 24", width: "20", height: "20", fill: "none",
      stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round",
      "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false"
    })) svg.setAttribute(name, value);
    icons[channel].forEach((attributes) => {
      const path = documentRoot.createElementNS("http://www.w3.org/2000/svg", "path");
      for (const [name, value] of Object.entries(attributes)) path.setAttribute(name, value);
      svg.append(path);
    });
    link.append(svg);
    navigation.append(link);
  });
  side.append(navigation);

  // Existing notes keep their text and remain below the icons, never behind them.
  for (const note of Array.from(layout.children).filter((child) => child.classList.contains("margin-note"))) {
    side.append(note);
  }
  layout.append(side);
}

addArticleShareIcons(document);

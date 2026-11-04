// Instagram sharing is completed by the reader in Instagram, never by this site.
// Canonical metadata also makes this work for articles created from the template.
function readInstagramArticle(documentRoot) {
  const canonical = documentRoot.querySelector('link[rel="canonical"]')?.getAttribute("href");
  const title = documentRoot.querySelector(".article-title")?.textContent.trim();
  if (!canonical || !title) return null;
  try {
    const url = new URL(canonical);
    if (!["https:", "http:"].includes(url.protocol)) return null;
    url.hash = "";
    const cover = documentRoot.querySelector('meta[property="og:image"]')?.getAttribute("content");
    let image = "";
    if (cover) {
      const resource = new URL(cover, url);
      // Use the local copy in previews too; do not draw third-party images.
      if (resource.origin === url.origin) {
        image = new URL(resource.pathname + resource.search, documentRoot.location?.href || url).href;
      }
    }
    return { title, url: url.href, image };
  } catch {
    return null;
  }
}

async function shareInstagramContent(data, navigatorRoot = navigator) {
  if (typeof navigatorRoot?.share !== "function") return "unavailable";
  const hasFiles = Boolean(data.files?.length);
  try {
    if (hasFiles && typeof navigatorRoot.canShare !== "function") return "unavailable";
    if (typeof navigatorRoot.canShare === "function" &&
        !navigatorRoot.canShare(hasFiles ? { files: data.files } : data)) return "unavailable";
    // No asynchronous preparation before this call: keep the click activation.
    await navigatorRoot.share(data);
    return "shared";
  } catch (error) {
    return error?.name === "AbortError" ? "cancelled" : "failed";
  }
}

function wrapInstagramTitle(context, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? line + " " + word : word;
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function loadInstagramImage(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

async function makeInstagramStory(article, documentRoot = document) {
  const canvas = documentRoot.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  const image = await loadInstagramImage(article.image);
  context.fillStyle = "#f4efe4";
  context.fillRect(0, 0, 1080, 1920);
  context.fillStyle = "#a83a32";
  context.fillRect(64, 164, 952, 8);
  context.fillStyle = "#132a38";
  context.font = "bold 112px Georgia, serif";
  context.fillText("L’Ardit", 64, 132);
  context.font = "28px Arial, sans-serif";
  context.fillText("ECONOMIA PER IL·LUSTRAR", 64, 225);

  let fontSize = 82;
  let lines;
  do {
    context.font = fontSize + "px Georgia, serif";
    lines = wrapInstagramTitle(context, article.title, 952);
    if (lines.length * fontSize * 1.12 <= 580) break;
    fontSize -= 2;
  } while (fontSize > 36);
  const lineHeight = fontSize * 1.12;
  lines.forEach((line, index) => context.fillText(line, 64, 338 + index * lineHeight));

  if (image?.naturalWidth && image?.naturalHeight) {
    const top = 390 + (lines.length - 1) * lineHeight;
    const maxHeight = 1670 - top;
    const scale = Math.min(952 / image.naturalWidth, maxHeight / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (1080 - width) / 2, top + (maxHeight - height) / 2, width, height);
  }
  context.fillStyle = "#a83a32";
  context.fillRect(64, 1740, 952, 5);
  context.fillStyle = "#132a38";
  context.font = "bold 56px Georgia, serif";
  context.fillText(new URL(article.url).hostname, 64, 1830);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Image unavailable")), "image/png");
  });
  const slug = new URL(article.url).pathname.split("/").filter(Boolean).pop() || "article";
  const filename = "lardit-" + slug + "-instagram.png";
  const file = typeof File === "function" ? new File([blob], filename, { type: "image/png" }) : null;
  return { blob, file, filename };
}

function initInstagramSharing(documentRoot) {
  const triggers = Array.from(documentRoot.querySelectorAll("[data-share-instagram]"));
  if (!triggers.length) return;
  const article = readInstagramArticle(documentRoot);
  if (!article) return;
  let activeDialog = null;
  let storyPromise = null;

  function element(tag, className, text) {
    const node = documentRoot.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function openDialog(trigger, event) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (activeDialog?.open) {
      event.preventDefault();
      return;
    }
    const dialog = element("dialog", "instagram-share");
    if (typeof dialog.showModal !== "function") return; // Static Instagram link remains usable.
    event.preventDefault();
    dialog.setAttribute("aria-labelledby", "instagram-share-title");
    const heading = element("h2", "", "Comparteix a Instagram");
    heading.id = "instagram-share-title";
    const close = element("button", "instagram-share__close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Tanca");
    close.addEventListener("click", () => dialog.close());
    dialog.append(close, heading);

    const status = element("p", "instagram-share__status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const label = element("label", "instagram-share__label", "Enllaç de l’article");
    const urlField = element("input");
    urlField.type = "url";
    urlField.value = article.url;
    urlField.readOnly = true;
    label.append(urlField);
    const copy = element("button", "", "Copia l’enllaç");
    copy.type = "button";
    copy.addEventListener("click", async () => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(article.url);
        status.textContent = "Enllaç copiat. Enganxa’l en un missatge o a l’adhesiu «Enllaç» de la història.";
      } catch {
        urlField.focus();
        urlField.select();
        status.textContent = "Copia l’enllaç seleccionat i enganxa’l a Instagram.";
      }
    });
    const copyRow = element("div", "instagram-share__url");
    copyRow.append(label, copy);
    dialog.append(copyRow);

    function externalLink(text, url) {
      const link = element("a", "", text);
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const hint = element("span", "visually-hidden", " (s’obre en una pestanya nova)");
      link.append(hint);
      return link;
    }

    const direct = element("section");
    direct.append(element("h3", "", "Missatge directe"));
    direct.append(element("p", "", "Copia l’enllaç, obre els missatges d’Instagram i enganxa’l a la conversa."));
    const directActions = element("div", "instagram-share__actions");
    directActions.append(externalLink("Obre els missatges", "https://www.instagram.com/direct/inbox/"));
    if (typeof navigator.share === "function") {
      const nativeLink = element("button", "", "Comparteix l’enllaç…");
      nativeLink.type = "button";
      nativeLink.addEventListener("click", async () => {
        const result = await shareInstagramContent({ title: article.title, url: article.url });
        if (result === "unavailable" || result === "failed") {
          status.textContent = "Pots copiar l’enllaç i enganxar-lo directament a la conversa d’Instagram.";
        }
      });
      directActions.append(nativeLink);
    }
    direct.append(directActions);
    dialog.append(direct);

    const stories = element("section");
    stories.append(element("h3", "", "Històries"));
    const storyRow = element("div", "instagram-share__story");
    const preview = element("img");
    preview.alt = "Targeta de l’article per compartir a les històries";
    preview.width = 1080;
    preview.height = 1920;
    preview.hidden = true;
    const storyContent = element("div");
    storyContent.append(element("p", "", "Comparteix o desa la imatge i afegeix-hi l’adhesiu «Enllaç» amb l’adreça de l’article."));
    const preparation = element("p", "instagram-share__preparation", "Preparant la imatge…");
    preparation.setAttribute("role", "status");
    const storyActions = element("div", "instagram-share__actions");
    const nativeImage = element("button", "", "Comparteix la imatge…");
    nativeImage.type = "button";
    nativeImage.hidden = true;
    const download = element("a", "", "Descarrega la imatge");
    download.hidden = true;
    storyActions.append(nativeImage, download);
    storyContent.append(preparation, storyActions);
    storyRow.append(preview, storyContent);
    stories.append(storyRow);
    dialog.append(stories, status);

    let objectURL = "";
    dialog.addEventListener("close", () => {
      if (objectURL) URL.revokeObjectURL(objectURL);
      dialog.remove();
      activeDialog = null;
      trigger.focus();
    });
    dialog.addEventListener("click", (click) => {
      if (click.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (click.clientX < bounds.left || click.clientX > bounds.right ||
          click.clientY < bounds.top || click.clientY > bounds.bottom) dialog.close();
    });
    documentRoot.body.append(dialog);
    activeDialog = dialog;
    dialog.showModal();
    copy.focus();
    storyPromise ||= makeInstagramStory(article, documentRoot);
    storyPromise.then(({ blob, file, filename }) => {
      if (!dialog.open) return;
      objectURL = URL.createObjectURL(blob);
      preview.src = objectURL;
      preview.hidden = false;
      download.href = objectURL;
      download.download = filename;
      download.hidden = false;
      preparation.textContent = "Imatge vertical preparada. A Instagram, afegeix-hi l’enllaç que has copiat.";
      let canShareFile = false;
      try {
        canShareFile = Boolean(file && typeof navigator.share === "function" && navigator.canShare?.({ files: [file] }));
      } catch { /* Download remains available when native sharing is restricted. */ }
      if (canShareFile) {
        nativeImage.hidden = false;
        preparation.textContent = "Si Instagram apareix al menú del mòbil, tria’l i continua a Històries. Afegeix-hi l’adhesiu «Enllaç».";
        nativeImage.addEventListener("click", async () => {
          const result = await shareInstagramContent({ files: [file], title: article.title });
          if (result === "unavailable" || result === "failed") {
            status.textContent = "Pots descarregar la imatge, obrir Instagram i afegir-la a una història.";
          }
        });
      }
    }).catch(() => {
      storyPromise = null;
      if (dialog.open) preparation.textContent = "No s’ha pogut preparar la imatge. Pots compartir l’enllaç per missatge directe.";
    });
  }

  triggers.forEach((trigger) => {
    if (trigger.getAttribute("data-instagram-ready") !== null) return;
    trigger.setAttribute("data-instagram-ready", "");
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-label", "Comparteix a Instagram: missatge directe o històries");
    trigger.addEventListener("click", (event) => openDialog(trigger, event));
  });
}

initInstagramSharing(document);

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../assets/instagram-share.js", import.meta.url), "utf8");
const initializationSelectors = [];
let automaticShareCalls = 0;
const context = vm.createContext({
  URL,
  document: {
    querySelectorAll(selector) {
      initializationSelectors.push(selector);
      return [];
    }
  },
  navigator: {
    share() {
      automaticShareCalls += 1;
      return Promise.resolve();
    }
  }
});
vm.runInContext(source, context, { filename: "assets/instagram-share.js" });

const { readInstagramArticle, shareInstagramContent } = context;

function attributeNode(name, value) {
  return { getAttribute: (requested) => requested === name ? value : null };
}

function articleDocument({
  canonical = "https://lardit.cat/articles/prova/",
  title = "  Oferta, demanda i habitatge  ",
  image = "https://lardit.cat/assets/prova.jpg?v=7",
  location = "http://127.0.0.1:4173/articles/prova/?utm_source=preview#esborrany"
} = {}) {
  return {
    location: { href: location },
    querySelector(selector) {
      if (selector === 'link[rel="canonical"]') return canonical === null ? null : attributeNode("href", canonical);
      if (selector === ".article-title") return title === null ? null : { textContent: title };
      if (selector === 'meta[property="og:image"]') return image === null ? null : attributeNode("content", image);
      return null;
    }
  };
}

test("loading without an Instagram trigger has no automatic sharing side effects", () => {
  assert.deepEqual(initializationSelectors, ["[data-share-instagram]"]);
  assert.equal(automaticShareCalls, 0);
});

test("article data uses the canonical URL, strips its hash and maps a same-origin cover to the preview origin", () => {
  const article = readInstagramArticle(articleDocument({
    canonical: "https://lardit.cat/articles/prova/#resultats"
  }));
  assert.equal(article.title, "Oferta, demanda i habitatge");
  assert.equal(article.url, "https://lardit.cat/articles/prova/");
  assert.equal(article.image, "http://127.0.0.1:4173/assets/prova.jpg?v=7");
});

test("external covers are excluded and invalid canonical URLs are rejected", () => {
  const external = readInstagramArticle(articleDocument({ image: "https://imatges.example/coberta.jpg" }));
  assert.equal(external.image, "");
  assert.equal(readInstagramArticle(articleDocument({ canonical: "ftp://lardit.cat/article/" })), null);
  assert.equal(readInstagramArticle(articleDocument({ canonical: null })), null);
  assert.equal(readInstagramArticle(articleDocument({ title: "   " })), null);
});

test("native sharing starts synchronously and resolves as shared", async () => {
  const data = { title: "Article", url: "https://lardit.cat/articles/prova/" };
  let sharedData = null;
  let release;
  const navigatorRoot = {
    canShare(candidate) {
      assert.equal(candidate, data);
      return true;
    },
    share(candidate) {
      sharedData = candidate;
      return new Promise((resolve) => { release = resolve; });
    }
  };
  const pending = shareInstagramContent(data, navigatorRoot);
  assert.equal(sharedData, data, "navigator.share s’ha de cridar abans de cedir l’activació del clic");
  release();
  assert.equal(await pending, "shared");
});

test("cancelling native sharing returns cancelled without retries", async () => {
  const data = { title: "Article", url: "https://lardit.cat/articles/prova/" };
  let canShareCalls = 0;
  let shareCalls = 0;
  const navigatorRoot = {
    canShare(candidate) {
      canShareCalls += 1;
      assert.equal(candidate, data);
      return true;
    },
    share(candidate) {
      shareCalls += 1;
      assert.equal(candidate, data);
      const error = new Error("The visitor closed the share sheet");
      error.name = "AbortError";
      return Promise.reject(error);
    }
  };
  assert.equal(await shareInstagramContent(data, navigatorRoot), "cancelled");
  assert.equal(canShareCalls, 1);
  assert.equal(shareCalls, 1);
});

test("missing native sharing and rejected link capabilities are unavailable", async () => {
  assert.equal(await shareInstagramContent({ url: "https://lardit.cat/" }, {}), "unavailable");
  let shareCalls = 0;
  const navigatorRoot = {
    canShare() { return false; },
    share() { shareCalls += 1; return Promise.resolve(); }
  };
  assert.equal(await shareInstagramContent({ url: "https://lardit.cat/" }, navigatorRoot), "unavailable");
  assert.equal(shareCalls, 0);
});

test("files require canShare support and are checked before the original payload is shared", async () => {
  const file = { name: "historia.png", type: "image/png" };
  const data = { files: [file], title: "Article" };
  let shareCalls = 0;
  assert.equal(await shareInstagramContent(data, {
    share() { shareCalls += 1; return Promise.resolve(); }
  }), "unavailable");
  assert.equal(shareCalls, 0);

  let capability = null;
  const rejected = {
    canShare(candidate) { capability = candidate; return false; },
    share() { shareCalls += 1; return Promise.resolve(); }
  };
  assert.equal(await shareInstagramContent(data, rejected), "unavailable");
  assert.equal(capability.files, data.files);
  assert.deepEqual(Object.keys(capability), ["files"]);
  assert.equal(shareCalls, 0);

  let sharedData = null;
  const accepted = {
    canShare(candidate) { return candidate.files === data.files; },
    share(candidate) { sharedData = candidate; return Promise.resolve(); }
  };
  assert.equal(await shareInstagramContent(data, accepted), "shared");
  assert.equal(sharedData, data);
});

test("unexpected capability and share errors fail once without retrying", async () => {
  let shareCalls = 0;
  assert.equal(await shareInstagramContent({ url: "https://lardit.cat/" }, {
    canShare() { throw new Error("Blocked capability check"); },
    share() { shareCalls += 1; return Promise.resolve(); }
  }), "failed");
  assert.equal(shareCalls, 0);

  const navigatorRoot = {
    canShare() { return true; },
    share() { shareCalls += 1; return Promise.reject(new Error("Share failed")); }
  };
  assert.equal(await shareInstagramContent({ url: "https://lardit.cat/" }, navigatorRoot), "failed");
  assert.equal(shareCalls, 1);
});

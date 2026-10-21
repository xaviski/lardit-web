import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

// Minimal DOM double: exercise the enhancement without adding browser packages.
class Element {
  constructor(tag) { this.tag = tag; this.attributes = {}; this.children = []; this.text = ""; }
  set className(value) { this.attributes.class = value; }
  get className() { return this.attributes.class ?? ""; }
  get classList() { return { contains: (name) => this.className.split(/\s+/).includes(name) }; }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text + this.children.map((child) => child.textContent).join(""); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  append(child) {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
    child.parent = this;
    this.children.push(child);
  }
  descendants() { return this.children.flatMap((child) => [child, ...child.descendants()]); }
  querySelectorAll(selector) {
    return selector.split(" ").reduce((parents, part) => parents.flatMap((parent) => parent.descendants().filter((node) =>
      part.startsWith(".") ? node.classList.contains(part.slice(1)) : node.tag === part
    )), [this]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}

const source = readFileSync(new URL("../assets/main.js", import.meta.url), "utf8");
function fixture({ article = true, channels = ["WhatsApp", "X", "Facebook", "Correu"] } = {}) {
  const document = new Element("document");
  document.createElement = (tag) => new Element(tag);
  document.createElementNS = (_, tag) => new Element(tag);
  if (!article) return { document };
  const layout = new Element("div"); layout.className = "article-layout";
  const body = new Element("article"); body.className = "article-body";
  const share = new Element("nav"); share.className = "article-share";
  const links = new Element("div"); links.className = "article-share__links";
  channels.forEach((channel, index) => {
    const link = new Element("a"); link.textContent = channel;
    link.setAttribute("href", index === 3 ? "mailto:?subject=Prova&body=https%3A%2F%2Flardit.cat%2Fprova%2F" : `https://example.test/${index}?article=prova`);
    if (index !== 3) {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
      const hint = new Element("span"); hint.className = "visually-hidden";
      hint.textContent = " (s’obre en una pestanya nova)"; link.append(hint);
    }
    links.append(link);
  });
  share.append(links); body.append(share); layout.append(body);
  const note = new Element("aside"); note.className = "margin-note";
  note.textContent = "La nota original es conserva."; layout.append(note); document.append(layout);
  return { document, layout, body, share, links, note };
}
function enhance(fixture) {
  const context = vm.createContext({ document: fixture.document });
  vm.runInContext(source, context);
  return context;
}

test("rail copies all four destinations, adds accessible icons and preserves the original block", () => {
  const page = fixture(); enhance(page);
  const rail = page.layout.querySelector(".article-share-icons");
  assert.ok(rail);
  assert.equal(rail.getAttribute("aria-label"), "Comparteix aquest article: opcions laterals");
  const links = rail.querySelectorAll("a");
  assert.equal(links.length, 4);
  links.forEach((link, index) => {
    assert.equal(link.getAttribute("href"), page.links.children[index].getAttribute("href"));
    assert.ok(link.getAttribute("aria-label")); assert.ok(link.getAttribute("title"));
    assert.equal(link.textContent, "");
    const icon = link.querySelector("svg");
    assert.equal(icon.getAttribute("aria-hidden"), "true");
    assert.equal(icon.getAttribute("focusable"), "false");
    if (index < 3) {
      assert.equal(link.getAttribute("target"), "_blank");
      assert.equal(link.getAttribute("rel"), "noopener noreferrer");
      assert.match(link.getAttribute("aria-label"), /pestanya nova/);
    } else assert.equal(link.getAttribute("target"), null);
  });
  assert.equal(page.body.querySelector(".article-share"), page.share);
  assert.equal(page.share.querySelectorAll("a").length, 4);
  assert.equal(page.note.textContent, "La nota original es conserva.");
  const side = page.layout.querySelector(".article-side");
  assert.deepEqual(side.children, [rail, page.note]);
});

test("initializing twice never duplicates the rail or its notes", () => {
  const page = fixture(); const context = enhance(page);
  vm.runInContext("addArticleShareIcons(document)", context);
  assert.equal(page.layout.querySelectorAll(".article-side").length, 1);
  assert.equal(page.layout.querySelectorAll(".article-share-icons").length, 1);
  assert.equal(page.layout.querySelectorAll(".margin-note").length, 1);
});

test("pages without an article remain unchanged", () => {
  const page = fixture({ article: false }); enhance(page);
  assert.equal(page.document.querySelectorAll(".article-side").length, 0);
});

test("incomplete or unknown channels do not produce an invalid rail", () => {
  for (const channels of [["WhatsApp", "X"], ["WhatsApp", "X", "Facebook", "Desconegut"]]) {
    const page = fixture({ channels }); enhance(page);
    assert.equal(page.layout.querySelectorAll(".article-share-icons").length, 0);
    assert.equal(page.note.parent, page.layout);
  }
});

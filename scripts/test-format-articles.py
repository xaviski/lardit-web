"""Keep every article on the shared transport-public layout (no dependencies)."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import re

ROOT = Path(__file__).resolve().parents[1]
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


class Element:
    def __init__(self, tag, attrs, parent=None):
        self.tag, self.attrs, self.parent = tag, dict(attrs), parent
        self.children = []

    def has(self, name):
        return name in self.attrs.get("class", "").split()

    def find(self, predicate):
        return [child for child in self.children if predicate(child)] + [
            found for child in self.children for found in child.find(predicate)]


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.root = Element("document", {})
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        node = Element(tag, attrs, self.stack[-1])
        node.parent.children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return


def one(nodes, message):
    assert len(nodes) == 1, message
    return nodes[0]


versions = set()
total = 0
for path in sorted((ROOT / "articles").rglob("index.html")):
    html = path.read_text(encoding="utf-8")
    page = Page(html).root
    mains = page.find(lambda node: node.tag == "main" and node.attrs.get("id") == "article")
    if not mains:
        continue
    total += 1
    name = path.relative_to(ROOT).as_posix()
    main = one(mains, name + ": cal un sol main#article")
    header = one(main.find(lambda node: node.has("article-header")), name + ": falta la capçalera comuna")
    assert header.tag == "header" and header.has("shell"), name
    assert set(header.attrs.get("class", "").split()) == {"shell", "article-header"}, name + ": capçalera particular"
    assert len(header.find(lambda node: node.tag == "h1" and node.has("article-title"))) == 1, name
    assert len(header.find(lambda node: node.has("article-deck"))) == 1, name
    assert len(header.find(lambda node: node.has("article-meta"))) == 1, name
    layout = one(main.find(lambda node: node.has("article-layout")), name + ": falta la graella comuna")
    assert set(layout.attrs.get("class", "").split()) == {"shell", "article-layout"}, name + ": graella particular"
    rail = one(layout.find(lambda node: node.has("article-rail")), name + ": falta el menú lateral")
    body = one(layout.find(lambda node: node.has("article-body")), name + ": falta el cos de lectura")
    assert rail.tag == "aside" and rail.parent is layout, name
    assert body.tag == "article" and body.parent is layout, name
    assert layout.children.index(rail) < layout.children.index(body), name
    assert set(body.attrs.get("class", "").split()) <= {"article-body", "draft-body"}, name
    lead = next((node for node in body.children if node.tag == "p"), None)
    assert lead and lead.has("article-lead"), name + ": la introducció ha de seguir el model compartit"
    toc = one(rail.find(lambda node: node.tag == "nav" and node.has("article-toc")), name + ": falta el TOC")
    assert toc.attrs.get("aria-label"), name
    ids = {node.attrs["id"] for node in main.find(lambda node: "id" in node.attrs)}
    links = toc.find(lambda node: node.tag == "a")
    assert links, name
    for link in links:
        href = link.attrs.get("href", "")
        assert href.startswith("#") and href[1:] in ids, name + ": enllaç del menú invàlid: " + href
    for node in [header, layout, rail, body]:
        assert "style" not in node.attrs, name + ": no s’admeten ajustos estructurals en línia"
    assert not one(page.find(lambda node: node.tag == "body"), name).attrs.get("class"), name + ": no s’admet un tema particular per article"
    stylesheets = page.find(lambda node: node.tag == "link" and node.attrs.get("rel") == "stylesheet")
    paths = [urlsplit(node.attrs["href"]).path for node in stylesheets]
    assert paths.count("/assets/styles.css") == 1, name
    assert set(paths) <= {"/assets/styles.css", "/assets/drafts.css"}, name + ": estils particulars fora del format comú"
    versions.add(next(node.attrs["href"] for node in stylesheets if urlsplit(node.attrs["href"]).path == "/assets/styles.css"))
    for inline in re.findall(r"<style\b[^>]*>([\s\S]*?)</style>", html):
        assert not re.search(r"\.article-(?:layout|rail|body|header|title|lead|toc|figure)\b", inline), name + ": sobreescriptura local del format"

assert total >= 3, "No s’han trobat els articles publicats"
assert len(versions) == 1, "Tots els articles han de carregar la mateixa versió del CSS comú"
css = (ROOT / "assets/styles.css").read_text(encoding="utf-8")
assert "--article-copy-width: 740px;" in css
assert "--article-column-gap: 2rem;" in css
assert "grid-template-columns: minmax(0, 1fr) minmax(0, var(--article-copy-width)) minmax(0, 1fr);" in css
assert "@media (min-width: 1101px)" in css
assert "grid-template-columns: minmax(0, 1fr) var(--article-column-gap) minmax(0, var(--article-copy-width)) var(--article-column-gap) minmax(0, 1fr);" in css
assert "grid-column: 1 / 3;" in css and "justify-self: center;" in css
assert ".article-body { grid-column: 3; }" in css
assert "@media (min-width: 701px) and (max-width: 1100px)" in css
assert "max-height: calc(100dvh - 4rem);" in css and "overflow-y: auto;" in css
# Shared primitives must not be overridden by article-specific parent classes.
for rule in re.findall(r"([^{}]+)\{[^{}]*\}", re.sub(r"/\*[\s\S]*?\*/", "", css)):
    for selector in rule.split(","):
        selector = selector.strip()
        if re.search(r"\.article-(?:layout|rail|body|header|title|lead|toc|figure)\b", selector):
            assert selector.startswith((".article-", ".manifest-header ")), "Format particular: " + selector
draft_css = (ROOT / "assets/drafts.css").read_text(encoding="utf-8")
assert not re.search(r"\.draft-header|\.article-(?:layout|rail|body|header|title|lead|toc|figure)\b", draft_css)
template = (ROOT / "templates/article.html.example").read_text(encoding="utf-8")
assert 'content="noindex,nofollow,noarchive"' in template
assert next(iter(versions)) in template
for snippet in ['class="shell article-header', 'class="shell article-layout"', '<aside class="article-rail">', 'class="article-toc"', '<article class="article-body', 'class="article-lead"']:
    assert snippet in template, "La plantilla no segueix el model: " + snippet
assert (ROOT / "docs/estil-articles.md").exists()
print(f"PASS: {total} articles and the template share layout, navigation, typography and CSS; valid anchors and no article-specific layout.")

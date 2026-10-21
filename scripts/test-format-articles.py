"""Keep every article on the shared transport-public layout (no dependencies)."""
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, quote, urlsplit
import re

ROOT = Path(__file__).resolve().parents[1]
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


class Element:
    def __init__(self, tag, attrs, parent=None):
        self.tag, self.attrs, self.parent = tag, dict(attrs), parent
        self.children = []
        self.text = ""
        self.content = []

    def has(self, name):
        return name in self.attrs.get("class", "").split()

    def find(self, predicate):
        matches = []
        for child in self.children:
            if predicate(child):
                matches.append(child)
            matches.extend(child.find(predicate))
        return matches


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.root = Element("document", {})
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        node = Element(tag, attrs, self.stack[-1])
        node.parent.children.append(node)
        node.parent.content.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return

    def handle_data(self, data):
        self.stack[-1].text += data
        self.stack[-1].content.append(data)


def one(nodes, message):
    assert len(nodes) == 1, message
    return nodes[0]


def in_key_points(node):
    while node.parent:
        node = node.parent
        if node.has("key-points"):
            return True
    return False


def text_content(node, visible_only=False):
    if visible_only and node.has("visually-hidden"):
        return ""
    return "".join(part if isinstance(part, str) else text_content(part, visible_only)
                   for part in node.content)


def body_child(node, body):
    while node.parent is not body:
        assert node.parent, "El bloc no pertany al cos de l’article"
        node = node.parent
    return node


def check_article_sharing(body, title, canonical, name, template=False):
    share = one(body.find(lambda node: node.has("article-share")),
                name + ": cal un únic bloc per compartir")
    document = body
    while document.parent:
        document = document.parent
    assert one(document.find(lambda node: node.has("article-share")), name + ": el bloc per compartir no es duplica fora del cos") is share, name
    assert share.tag == "nav" and share.parent is body, name + ": el bloc per compartir ha de ser germà de les seccions"
    assert share.attrs.get("aria-label") == "Comparteix aquest article", name + ": falta l’etiqueta accessible per compartir"
    label = one(share.find(lambda node: node.has("article-share__label")), name + ": falta el títol del bloc per compartir")
    assert label.tag == "p" and text_content(label).strip() == "Comparteix l’article", name
    group = one(share.find(lambda node: node.has("article-share__links")), name + ": falta el grup d’enllaços per compartir")
    links = group.find(lambda node: node.tag == "a")
    assert len(links) == 4 and len(share.find(lambda node: node.tag == "a")) == 4, name + ": calen les quatre opcions per compartir"
    assert [text_content(link, visible_only=True).strip() for link in links] == ["WhatsApp", "X", "Facebook", "Correu"], name + ": opcions per compartir incompletes o desordenades"

    share_index = body.children.index(share)
    headings = body.find(lambda node: node.tag == "h2" and not in_key_points(node))
    editorial, appendices = [], []
    for heading in headings:
        siblings = heading.parent.children
        index = siblings.index(heading)
        label = siblings[index - 1] if index else None
        if label and label.has("section-number--appendix"):
            appendices.append(body_child(heading, body))
        else:
            editorial.append(body_child(heading, body))
    assert editorial and all(body.children.index(node) < share_index for node in editorial), name + ": compartir ha d’anar després de la conclusió"
    appendix_index = min((body.children.index(node) for node in appendices), default=len(body.children))
    assert share_index + 1 == appendix_index, name + ": compartir ha de tancar el contingut abans de fonts i metodologia"

    share_title = "{{TITOL_COMPARTIR_URLENCODED}}" if template else title + " — L’Ardit"
    share_url = "{{URL_CANONICA_URLENCODED}}" if template else canonical
    expected = [
        ("https", "wa.me", "/", {"text": [share_title + " " + share_url]}),
        ("https", "twitter.com", "/intent/tweet", {"text": [share_title], "url": [share_url]}),
        ("https", "www.facebook.com", "/sharer/sharer.php", {"u": [share_url]}),
        ("mailto", "", "", {"subject": [share_title], "body": ["Et recomano aquest article:\n\n" + share_url]}),
    ]
    for link, (scheme, host, path, query) in zip(links, expected):
        destination = urlsplit(link.attrs.get("href", ""))
        assert (destination.scheme, destination.netloc, destination.path) == (scheme, host, path), name + ": destinació per compartir incorrecta"
        assert not destination.fragment and parse_qs(destination.query, keep_blank_values=True) == query, name + ": compartir ha d’usar el títol i la URL canònica de l’article"
        accessible_name = link.attrs.get("aria-label", text_content(link)).strip()
        assert accessible_name.startswith(text_content(link, visible_only=True).strip()), name + ": nom accessible incorrecte"
        if scheme == "https":
            assert link.attrs.get("target") == "_blank", name + ": les xarxes s’obren en una pestanya nova"
            assert {"noopener", "noreferrer"} <= set(link.attrs.get("rel", "").split()), name + ": falta la protecció dels enllaços externs"
            hints = link.find(lambda node: node.has("visually-hidden"))
            assert any("pestanya nova" in text_content(hint) for hint in hints), name + ": falta l’avís accessible de pestanya nova"


def check_section_headings(body, name):
    numbered = []
    headings = body.find(lambda node: node.tag == "h2" and not in_key_points(node))
    assert headings, name + ": falten les seccions"
    for heading in headings:
        siblings = heading.parent.children
        index = siblings.index(heading)
        assert 0 < index < len(siblings) - 1, name + ": encapçalament de secció incomplet"
        label, subtitle = siblings[index - 1], siblings[index + 1]
        assert label.tag == "p" and label.has("section-number"), name + ": falta l’etiqueta de secció"
        assert subtitle.tag == "p" and subtitle.has("chart-subtitle"), name + ": falta el subtítol de secció"
        assert label.text.strip() and subtitle.text.strip(), name + ": etiqueta o subtítol buit"
        assert heading.attrs.get("id"), name + ": falta l’ancoratge de secció"
        if label.has("section-number--appendix"):
            assert not re.match(r"\d", label.text.strip()), name + ": l’apèndix no es numera"
        else:
            expected = f"{len(numbered) + 1:02d} · "
            assert label.text.strip().startswith(expected), name + ": numeració de seccions no consecutiva"
            assert label.text.strip()[len(expected):].strip(), name
            numbered.append("#" + heading.attrs["id"])
    return numbered


mixed_sections = Page('''<article class="article-body">
<p class="section-number">01 · Primer</p><h2 id="primer">Primer</h2><p class="chart-subtitle">Abast.</p>
<section><p class="section-number">02 · Segon</p><h2 id="segon">Segon</h2><p class="chart-subtitle">Abast.</p></section>
<p class="section-number">03 · Tercer</p><h2 id="tercer">Tercer</h2><p class="chart-subtitle">Abast.</p>
</article>''').root.children[0]
assert check_section_headings(mixed_sections, "ordre del document") == ["#primer", "#segon", "#tercer"]


def check_sharing_regressions():
    title, canonical = "Una prova d’habitatge & consum?", "https://lardit.cat/articles/proves/compartir/"
    encoded_title, encoded_url = quote(title + " — L’Ardit", safe=""), quote(canonical, safe="")
    urls = [
        "https://wa.me/?text=" + encoded_title + "%20" + encoded_url,
        "https://twitter.com/intent/tweet?text=" + encoded_title + "&url=" + encoded_url,
        "https://www.facebook.com/sharer/sharer.php?u=" + encoded_url,
        "mailto:?subject=" + encoded_title + "&body=" + quote("Et recomano aquest article:\n\n" + canonical, safe=""),
    ]
    anchors = []
    for index, (label, href) in enumerate(zip(["WhatsApp", "X", "Facebook", "Correu"], urls)):
        external = ' target="_blank" rel="noopener noreferrer"' if index < 3 else ""
        hint = '<span class="visually-hidden"> (s’obre en una pestanya nova)</span>' if index < 3 else ""
        anchors.append(f'<a href="{escape(href, quote=True)}"{external}>{label}{hint}</a>')
    share = '<nav class="article-share" aria-label="Comparteix aquest article"><p class="article-share__label">Comparteix l’article</p><div class="article-share__links">' + "".join(anchors) + '</div></nav>'
    conclusion = '<section><p class="section-number">01 · Conclusió</p><h2 id="conclusio">Conclusió</h2><p class="chart-subtitle">Abast.</p><p>Final.</p></section>'
    appendix = '<section><p class="section-number section-number--appendix">Fonts</p><h2 id="fonts">Fonts</h2><p class="chart-subtitle">Procedència.</p></section>'
    fixture = '<article class="article-body">' + conclusion + share + appendix + '</article>'

    def check(html):
        check_article_sharing(Page(html).root.children[0], title, canonical, "regressió compartir")

    check(fixture)
    invalid = [
        fixture.replace(share, ""),
        fixture.replace(share, share + share),
        fixture.replace(encoded_url, quote("https://lardit.cat/articles/altre/", safe="")),
        fixture.replace(encoded_title, quote("Títol d’un altre article — L’Ardit", safe="")),
        fixture.replace(' rel="noopener noreferrer"', "", 1),
        fixture.replace(conclusion + share, share + conclusion),
        fixture.replace(share + appendix, share + '<p>La conclusió continua.</p>' + appendix),
        fixture.replace(anchors[2], ""),
    ]
    for index, html in enumerate(invalid):
        try:
            check(html)
        except AssertionError:
            continue
        raise AssertionError(f"La comprovació de compartir no detecta el cas invàlid {index}")


check_sharing_regressions()


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
    is_draft = any(re.search(r"\bnoindex\b", node.attrs.get("content", ""), re.IGNORECASE)
                   for node in page.find(lambda node: node.tag == "meta" and node.attrs.get("name", "").lower() == "robots"))
    if not is_draft:
        numbered = check_section_headings(body, name)
        toc_sections = [link.attrs["href"] for link in links if link.attrs["href"] in numbered]
        assert toc_sections == numbered, name + ": la numeració i l’ordre del menú han de coincidir amb les seccions"
        title = " ".join(text_content(one(header.find(lambda node: node.tag == "h1"), name)).split())
        canonical = one(page.find(lambda node: node.tag == "link" and node.attrs.get("rel") == "canonical"), name).attrs["href"]
        check_article_sharing(body, title, canonical, name)
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
template_body = one(Page(template).root.find(lambda node: node.has("article-body")), "plantilla")
assert check_section_headings(template_body, "plantilla") == ["#analisi", "#conclusions"]
check_article_sharing(template_body, "", "", "plantilla", template=True)
for snippet in ['class="shell article-header', 'class="shell article-layout"', '<aside class="article-rail">', 'class="article-toc"', '<article class="article-body', 'class="article-lead"']:
    assert snippet in template, "La plantilla no segueix el model: " + snippet
assert (ROOT / "docs/estil-articles.md").exists()
print(f"PASS: {total} articles and the template share layout, navigation, typography and CSS; valid anchors, sharing links in published articles and the template, and no article-specific layout.")

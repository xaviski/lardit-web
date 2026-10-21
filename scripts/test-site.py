"""Check public routes, sharing metadata and crawlability without dependencies/network."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, unquote, urljoin, urlsplit
from urllib.robotparser import RobotFileParser
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SITE = "https://lardit.cat"
HOSTS = {"lardit.cat", "www.lardit.cat"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}


class Page(HTMLParser):
    def __init__(self, html, name):
        super().__init__()
        self.name, self.nodes, self.meta, self.ids, self.jsonld = name, [], {}, [], []
        self.title, self.h1_count, self.in_head, self.in_title = "", 0, False, False
        self.ld_buffer = None
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.nodes.append((tag, attrs, self.getpos()[0]))
        if tag == "head":
            self.in_head = True
        if tag == "title" and self.in_head:
            self.in_title = True
        if tag == "h1":
            self.h1_count += 1
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag == "meta":
            key = attrs.get("name", attrs.get("property", "")).lower()
            self.meta.setdefault(key, []).append(attrs.get("content", ""))
        if tag == "script" and attrs.get("type", "").lower() == "application/ld+json":
            self.ld_buffer = ""

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if tag == "head":
            self.in_head = False
        if tag == "script" and self.ld_buffer is not None:
            self.jsonld.append(self.ld_buffer)
            self.ld_buffer = None

    def handle_data(self, text):
        if self.in_title:
            self.title += text
        if self.ld_buffer is not None:
            self.ld_buffer += text

    def value(self, key):
        values = self.meta.get(key, [])
        assert len(values) == 1 and values[0].strip(), f"{self.name}: falta {key} o està duplicat/buit"
        assert not re.search(r"\{\{|\}\}|localhost|127\.0\.0\.1", values[0]), f"{self.name}: camp provisional a {key}"
        return values[0]

    @property
    def noindex(self):
        return any(re.search(r"\bnoindex\b", value, re.I) for value in self.meta.get("robots", []))


def route(path):
    relative = path.relative_to(ROOT).as_posix()
    return "/" + (relative[:-10] if relative.endswith("index.html") else relative)


def local_target(url):
    path = (ROOT / unquote(urlsplit(url).path).lstrip("/")).resolve()
    assert path.is_relative_to(ROOT), "Ruta local fora del web: " + url
    return path / "index.html" if path.is_dir() else path


def canonical(page, expected):
    links = [attrs.get("href", "") for tag, attrs, _ in page.nodes
             if tag == "link" and "canonical" in attrs.get("rel", "").split()]
    assert links == [expected], f"{page.name}: URL canònica incorrecta o duplicada"


def check_jsonld(page):
    for raw in page.jsonld:
        try:
            document = json.loads(raw)
        except json.JSONDecodeError as error:
            raise AssertionError(f"{page.name}: JSON-LD invàlid: {error}") from error
        assert isinstance(document, (dict, list)) and document, f"{page.name}: JSON-LD buit"


def check_metadata(page, expected):
    canonical(page, expected)
    assert page.title.strip() and "{{" not in page.title, page.name + ": falta el títol real"
    assert page.h1_count == 1, page.name + ": cal un únic h1"
    for key in ["description", "og:type", "og:locale", "og:site_name", "og:title", "og:description",
                "og:url", "og:image", "og:image:alt", "twitter:card", "twitter:title",
                "twitter:description", "twitter:image", "twitter:image:alt"]:
        page.value(key)
    assert page.value("og:url") == expected, page.name + ": og:url diferent de la canònica"
    card = "summary_large_image" if page.value("og:type") == "article" else "summary"
    assert page.value("twitter:card") == card, page.name + ": tipus de targeta social incorrecte"
    for key in ["og:image", "twitter:image"]:
        url = page.value(key)
        parsed = urlsplit(url)
        assert parsed.scheme == "https" and parsed.netloc == "lardit.cat", page.name + ": imatge social no canònica"
        image = local_target(url)
        assert image.is_file() and image.suffix.lower() in IMAGE_EXTENSIONS, page.name + ": falta una imatge social compatible"
        assert 0 < image.stat().st_size < 5_000_000, page.name + ": mida de la imatge social invàlida"


def check_links(page, base, pages):
    assert len(page.ids) == len(set(page.ids)), page.name + ": identificadors duplicats"
    for tag, attrs, line in page.nodes:
        name = f"{page.name}:{line}"
        if tag == "a" and attrs.get("target") == "_blank":
            assert {"noopener", "noreferrer"} <= set(attrs.get("rel", "").split()), name + ": pestanya externa sense protecció"
        if tag == "img" and not page.noindex:
            assert "alt" in attrs and attrs.get("width") and attrs.get("height"), name + ": imatge sense alternativa o dimensions"
        refs = [attrs[key] for key in ["href", "src"] if attrs.get(key)]
        refs += [entry.strip().split()[0] for entry in attrs.get("srcset", "").split(",") if entry.strip()]
        for ref in refs:
            url = urlsplit(urljoin(base, ref))
            assert url.scheme != "javascript", name + ": enllaç javascript insegur"
            if url.scheme not in {"http", "https"}:
                continue
            if tag in {"img", "script", "link", "source"}:
                assert url.scheme == "https", name + ": contingut mixt HTTP"
            if url.netloc not in HOSTS:
                if tag == "a" and url.netloc in {"twitter.com", "x.com"} and url.path == "/intent/tweet":
                    assert parse_qs(url.query).get("url") == [base], name + ": compartir a X usa una URL aliena"
                continue
            target = local_target(url.geturl())
            assert target.is_file(), name + ": recurs local absent: " + ref
            if target in pages:
                destination = pages[target]
                if url.fragment:
                    assert unquote(url.fragment) in destination.ids, name + ": ancoratge absent: " + ref
                if tag == "a" and not page.noindex:
                    assert not destination.noindex, name + ": enllaç públic cap a una pàgina noindex"


def check_sitemap(locations, expected):
    assert len(locations) == len(set(locations)), "sitemap.xml: URL duplicada"
    assert set(locations) == set(expected), "sitemap.xml: ha de contenir exactament les pàgines indexables"


def regressions(pages):
    """A broken link or a public draft must not silently pass a future launch check."""
    first_path = next(path for path, page in pages.items()
                      if not page.noindex and page.meta.get("og:image") and page.meta.get("twitter:image"))
    html, expected = first_path.read_text(encoding="utf-8-sig"), SITE + route(first_path)
    check_metadata(Page(html, "base de regressió"), expected)
    cases = [
        lambda: check_metadata(Page(html.replace('property="og:image"', 'property="og:image-missing"', 1), "regressió"), expected),
        lambda: canonical(Page(html.replace(expected, "https://example.invalid/", 1), "regressió"), expected),
        lambda: check_jsonld(Page('<script type="application/ld+json">{"falta":</script>', "regressió")),
        lambda: check_links(Page('<a href="#ancora-inexistent-de-prova">Prova</a>', "regressió"), expected, pages),
        lambda: check_links(Page('<a href="https://twitter.com/intent/tweet?url=https%3A%2F%2Fexample.invalid%2F">X</a>', "regressió"), expected, pages),
        lambda: check_sitemap([expected, SITE + "/esborrany/"], [expected]),
    ]
    for index, check in enumerate(cases):
        try:
            check()
        except AssertionError:
            continue
        raise AssertionError(f"La comprovació global no detecta la regressió {index}")


def main():
    pages = {path.resolve(): Page(path.read_text(encoding="utf-8-sig"), path.relative_to(ROOT).as_posix())
             for path in sorted(ROOT.rglob("*.html"))
             if not any(part.startswith(".") or part in {"tmp", "node_modules"} for part in path.relative_to(ROOT).parts)}
    published = []
    for path, page in pages.items():
        expected = SITE + route(path)
        check_jsonld(page)
        check_links(page, expected, pages)
        if not page.noindex:
            check_metadata(page, expected)
            published.append(expected)

    namespace = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
    sitemap = ET.fromstring((ROOT / "sitemap.xml").read_text(encoding="utf-8-sig"))
    check_sitemap([node.text for node in sitemap.findall(f"{namespace}url/{namespace}loc")], published)
    robots = RobotFileParser()
    robots.parse((ROOT / "robots.txt").read_text(encoding="utf-8-sig").splitlines())
    assert SITE + "/sitemap.xml" in (robots.site_maps() or []), "robots.txt: falta el sitemap canònic"
    for bot in ["Googlebot", "Twitterbot"]:
        assert all(robots.can_fetch(bot, url) for url in published), f"robots.txt: bloqueja pàgines públiques per a {bot}"
    regressions(pages)
    print(f"PASS: {len(published)} public pages; valid routes, anchors, assets, social metadata, JSON-LD, robots and sitemap; 6 negative regressions.")


if __name__ == "__main__":
    main()

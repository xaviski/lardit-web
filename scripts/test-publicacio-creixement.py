"""Checks for the published growth article and its discovery routes.

Run from the repository root: python scripts/test-publicacio-creixement.py
Uses only the Python standard library; no network requests.
"""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse, unquote
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ARTICLE = "articles/economia/creixement-benestar-catalunya/index.html"
URL = "https://lardit.cat/articles/economia/creixement-benestar-catalunya/"
CATEGORY = "https://lardit.cat/articles/economia/"
IMAGE = "https://lardit.cat/assets/images/meme-pib-catalunya.jpeg"
PAGES = ["index.html", "articles/index.html", "articles/economia/index.html", ARTICLE]


class Page(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.ids, self.refs, self.headings = [], [], []
        self.metas, self.canonical = {}, None
        self.in_p = False
        self.feed(source)
        assert not self.in_p, "Unclosed paragraph"

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "p":
            assert not self.in_p, "Nested paragraph"
            self.in_p = True
        elif tag in ("div", "section", "figure", "aside", "nav", "table", "details", "ul", "ol", "h1", "h2", "h3"):
            assert not self.in_p, f"Block {tag} nested inside a paragraph"
        if "id" in a:
            self.ids.append(a["id"])
        if tag in ("h1", "h2", "h3"):
            self.headings.append(tag)
        if tag == "meta":
            self.metas[a.get("name", a.get("property", ""))] = a.get("content", "")
        if tag == "link" and a.get("rel") == "canonical":
            self.canonical = a["href"]
        if tag in ("a", "img", "source", "script", "link"):
            for key in ("href", "src", "srcset"):
                if key in a:
                    self.refs.append((tag, a[key], a))
        if tag == "img":
            assert a.get("alt") and a.get("width") and a.get("height"), a

    def handle_endtag(self, tag):
        if tag == "p":
            assert self.in_p, "Unexpected closing paragraph"
            self.in_p = False


sources = {name: (ROOT / name).read_text(encoding="utf-8") for name in PAGES}
parsed = {name: Page(source) for name, source in sources.items()}
schemas = {}
for name, page in parsed.items():
    assert page.headings.count("h1") == 1, name
    assert len(page.ids) == len(set(page.ids)), name
    assert page.metas.get("robots") == "index,follow", name
    assert page.canonical, name
    schemas[name] = [json.loads(x) for x in re.findall(
        r'<script type="application/ld\+json">([\s\S]*?)</script>', sources[name])]
    assert schemas[name], name
    for tag, ref, attrs in page.refs:
        u = urlparse(ref)
        if u.scheme or u.netloc:
            if tag == "a" and u.scheme in ("https", "http") and u.netloc != "lardit.cat":
                assert attrs.get("target") == "_blank", ref
                assert {"noopener", "noreferrer"} <= set(attrs.get("rel", "").split()), ref
            continue
        target = (ROOT / unquote(u.path).lstrip("/")) if u.path.startswith("/") else (ROOT / name).parent / unquote(u.path)
        if not u.path:
            target = ROOT / name
        if target.is_dir():
            target /= "index.html"
        assert target.exists(), f"{name}: {ref}"
        if u.fragment and target.suffix == ".html":
            # Existing pages can have unrelated legacy paragraph markup.
            target_ids = re.findall(r'\bid="([^"]+)"', target.read_text(encoding="utf-8"))
            assert unquote(u.fragment) in target_ids, ref

article = parsed[ARTICLE]
TITLE = re.search(r'<h1 class="article-title">([^<]+)</h1>', sources[ARTICLE]).group(1)
assert article.canonical == URL
assert article.metas["author"] == "Xavi Palahí"
assert article.metas["og:title"] == TITLE
assert article.metas["og:url"] == URL
assert article.metas["og:image"] == IMAGE == article.metas["twitter:image"]
assert article.metas["twitter:card"] == "summary_large_image"
assert article.metas["article:published_time"] == "2026-10-20"
assert not re.search(r"Esborrany|esborrany|noindex|Pendent de redacció|Material per a la redacció|drafts\.css", sources[ARTICLE])
assert sources[ARTICLE].count('<h2 id="conclusio">') == 1
assert sources[ARTICLE].count('/assets/charts/creixement-benestar/') == 16
graph = schemas[ARTICLE][0]["@graph"]
article_schema = next(item for item in graph if item["@type"] == "Article")
assert article_schema["headline"] == TITLE
assert article_schema["url"] == article_schema["mainEntityOfPage"] == URL
assert article_schema["datePublished"] == article_schema["dateModified"] == "2026-10-20"
assert article_schema["author"]["name"] == "Xavi Palahí"
assert article_schema["isPartOf"]["url"] == CATEGORY
home_items = schemas["index.html"][0]
assert home_items["numberOfItems"] == len(home_items["itemListElement"]) == 3
assert home_items["itemListElement"][0]["url"] == URL
assert sources["index.html"].count('class="home-story"') == 3
categories = schemas["articles/index.html"][0]["mainEntity"]
assert categories["numberOfItems"] == len(categories["itemListElement"]) == 3
assert CATEGORY in {x["item"]["url"] for x in categories["itemListElement"]}

ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
sitemap = ET.parse(ROOT / "sitemap.xml").getroot()
locations = [x.text for x in sitemap.findall("s:url/s:loc", ns)]
assert len(locations) == len(set(locations)) == 10
assert URL in locations and CATEGORY in locations
for url in sitemap.findall("s:url", ns):
    if url.find("s:loc", ns).text in (URL, CATEGORY, "https://lardit.cat/", "https://lardit.cat/articles/"):
        assert url.find("s:lastmod", ns).text == "2026-10-20"
# Discover draft paths rather than hard-coding their slugs.
unlisted_count = 0
for path in (ROOT / "articles").rglob("index.html"):
    content = path.read_text(encoding="utf-8")
    if re.search(r'<meta name="robots" content="noindex', content):
        relative = "/" + path.parent.relative_to(ROOT).as_posix() + "/"
        assert "https://lardit.cat" + relative not in locations
        assert relative not in sources["index.html"] and relative not in sources["articles/index.html"]
        unlisted_count += 1
assert unlisted_count >= 5
assert "Allow: /" in (ROOT / "robots.txt").read_text(encoding="utf-8")
for path in (ROOT / "assets/data/creixement-benestar").glob("*.json"):
    json.loads(path.read_text(encoding="utf-8"))

print(f"PASS: publication metadata, JSON-LD, local assets/anchors, 8 charts, 3 latest stories, 3 categories, sitemap and {unlisted_count} protected drafts.")

"""Guardes de dades, format i noindex de l’esborrany d’oferta i demanda."""
from pathlib import Path
import json
import re
import runpy
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
route = "/articles/habitatge/oferta-demanda-bombolla-immobiliaria/"
source = (ROOT / route.strip("/") / "index.html").read_text(encoding="utf-8")
data = json.loads((ROOT / "assets/data/oferta-demanda/habitatges.json").read_text(encoding="utf-8"))
annual = data["annual"]
assert [r["year"] for r in annual] == list(range(2000, 2014))
assert all(isinstance(r["dwellings"], int) and r["dwellings"] > 0 for r in annual)
assert sum(r["dwellings"] for r in annual if r["year"] <= 2007) == data["checks"]["sum_2000_2007"] == 4404136
peak = max(annual, key=lambda r: r["dwellings"])
assert (peak["year"], peak["dwellings"]) == (data["checks"]["peak_year"], data["checks"]["peak_dwellings"]) == (2006, 658510)
for r in annual:
    pretty = f'{r["dwellings"]:,}'.replace(",", ".")
    assert f'<th scope="row" data-label="Any">{r["year"]}</th><td data-label="Habitatges">{pretty}</td>' in source
    assert r["source_id"] == ("tcu" if r["year"] <= 2002 else "mivau")
example = data["illustrative_example"]
assert example["observed_data"] is False
a, b, c = example["scenarios"]
assert (a["quantity"], a["price_index"]) == (100, 100)
assert (b["quantity"], b["price_index"]) == (120, 80)
assert (c["quantity"], c["price_index"]) == (160, 120)
for row, demand_intercept, supply_intercept in [(a, 200, 0), (b, 200, 40), (c, 280, 40)]:
    assert row["quantity"] == demand_intercept - row["price_index"]
    assert row["quantity"] == row["price_index"] + supply_intercept
assert 'content="noindex,nofollow,noarchive"' in source
assert "article:published_time" not in source and "datePublished" not in source
assert "{{" not in source and "<style" not in source
for published in ["index.html", "articles/index.html", "articles/habitatge/index.html", "sitemap.xml"]:
    assert route not in (ROOT / published).read_text(encoding="utf-8"), published
# Reuse shared parsers to apply the published section/sharing contract to this new draft too.
contract = runpy.run_path(str(ROOT / "scripts/test-format-articles.py"))
tree = contract["Page"](source).root
body = contract["one"](tree.find(lambda n: n.has("article-body")), "nou esborrany")
for tbody in body.find(lambda n: n.tag == "tbody"):
    assert all(n.attrs.get("data-label") for n in tbody.find(lambda n: n.tag in {"th", "td"})), "Falten etiquetes de taula en mòbil"
title = contract["text_content"](contract["one"](tree.find(lambda n: n.tag == "h1"), "titular")).strip()
head_title = contract["text_content"](contract["one"](tree.find(lambda n: n.tag == "title"), "title")).strip()
assert head_title == title + " — L’Ardit", "Títol del navegador diferent del titular"
og_title = contract["one"](tree.find(lambda n: n.tag == "meta" and n.attrs.get("property") == "og:title"), "og:title")
assert og_title.attrs["content"] == title, "Títol social diferent del titular"
expected = ["#fragment", "#construccio", "#dues-corbes", "#demanda", "#rallo", "#conclusio"]
assert contract["check_section_headings"](body, "nou esborrany") == expected
toc = contract["one"](tree.find(lambda n: n.has("article-toc")), "menú")
assert [n.attrs["href"] for n in toc.find(lambda n: n.tag == "a")] == expected
contract["check_article_sharing"](body, title, "https://lardit.cat" + route, "nou esborrany")
site = runpy.run_path(str(ROOT / "scripts/test-site.py"))
page_path = ROOT / route.strip("/") / "index.html"
page = site["Page"](source, route)
pages = {}
for p in ROOT.rglob("*.html"):
    if ".git" not in p.parts:
        pages[p] = site["Page"](p.read_text(encoding="utf-8"), str(p))
site["canonical"](page, "https://lardit.cat" + route)
site["check_links"](page, "https://lardit.cat" + route, pages)
for name, width, height in [("habitatges-acabats.svg", 760, 430), ("habitatges-acabats-mobile.svg", 360, 390)]:
    svg_source = (ROOT / "assets/charts/oferta-demanda" / name).read_text(encoding="utf-8")
    svg = ET.fromstring(svg_source)
    assert svg.attrib["width"] == str(width) and svg.attrib["height"] == str(height)
    assert svg.attrib["role"] == "img" and svg.attrib["aria-labelledby"] == "title desc"
    bars = [n for n in svg if n.tag.endswith("rect") and n.attrib.get("fill") == "#1c6579"]
    assert len(bars) == 14 and all(float(n.attrib["height"]) >= 0 for n in bars)
    assert all(f'{r["year"]}: {r["dwellings"]:,}'.replace(",", ".") in svg_source for r in annual)
print("PASS: esborrany no indexat ni llistat; dades, exemple, gràfics, seccions, recursos i opcions de compartir coherents.")

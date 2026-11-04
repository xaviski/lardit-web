"""Guardes de publicació, dades i format de l’article d’oferta i demanda."""
from datetime import date
from pathlib import Path
import json
import math
import re
import runpy
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
route = "/articles/habitatge/oferta-demanda-bombolla-immobiliaria/"
canonical_url = "https://lardit.cat" + route
publication_date = "2026-11-04"
social_image_path = "/assets/images/oferta-demanda-habitatge.png"
social_image_url = "https://lardit.cat" + social_image_path
source = (ROOT / route.strip("/") / "index.html").read_text(encoding="utf-8")
data = json.loads((ROOT / "assets/data/oferta-demanda/habitatges.json").read_text(encoding="utf-8"))
price_data = json.loads((ROOT / "assets/data/oferta-demanda/preus-habitatge.json").read_text(encoding="utf-8"))
annual = data["annual"]
assert data["last_complete_year"] == data["checks"]["last_complete_year"] == 2025
assert [r["year"] for r in annual] == list(range(2000, data["last_complete_year"] + 1))
assert all(isinstance(r["dwellings"], int) and r["dwellings"] > 0 for r in annual)
assert sum(r["dwellings"] for r in annual if r["year"] <= 2007) == data["checks"]["sum_2000_2007"] == 4404136
peak = max(annual, key=lambda r: r["dwellings"])
assert (peak["year"], peak["dwellings"]) == (data["checks"]["peak_year"], data["checks"]["peak_dwellings"]) == (2006, 658510)
for r in annual:
    pretty = f'{r["dwellings"]:,}'.replace(",", ".")
    assert f'<th scope="row" data-label="Any">{r["year"]}</th><td data-label="Habitatges">{pretty}</td>' in source
    assert r["source_id"] == ("tcu" if r["year"] <= 2002 else "mivau" if r["year"] <= 2021 else "bdsice")
assert annual[-1]["dwellings"] == data["checks"]["last_dwellings"] == 93650
assert annual[-1]["status"] == "provisional"
assert data["partial_year"]["included_in_chart"] is False and data["partial_year"]["months_available"] < 12
for record in data["monthly_validation"]["annual_observations"]:
    assert len(record["months"]) == 12
    assert sum(record["months"]) == next(r["dwellings"] for r in annual if r["year"] == record["year"])
assert data["revisions"][-1]["current_free_dwellings"] + data["revisions"][-1]["current_protected_dwellings"] == annual[-1]["dwellings"]

price_quarterly = price_data["quarterly"]
price_annual = price_data["annual"]
price_checks = price_data["checks"]
assert price_data["first_year"] == 2000 and price_data["last_year"] == 2025
assert price_data["geography"] == "Espanya"
assert price_data["unit"] == "variació de la mitjana anual (%)"
assert price_data["method"]["annual_growth_formula"] == "100 * (mean_index_t / mean_index_t_minus_1 - 1)"
expected_periods = [f"{year}-Q{quarter}" for year in range(1999, 2026) for quarter in range(1, 5)]
assert [row["period"] for row in price_quarterly] == expected_periods
assert len(price_quarterly) == price_checks["quarterly_observations"] == 108
assert all(
    not isinstance(row[key], bool) and isinstance(row[key], (int, float)) and math.isfinite(row[key]) and row[key] > 0
    for row in price_quarterly
    for key in ("nominal_index", "real_index")
)
assert all(int(row["period"][:4]) <= 2025 for row in price_quarterly)

quarters_by_year = {}
for row in price_quarterly:
    year_text, quarter_text = row["period"].split("-Q")
    quarters_by_year.setdefault(int(year_text), {})[int(quarter_text)] = row
assert set(quarters_by_year) == set(range(1999, 2026))
assert all(set(quarters) == {1, 2, 3, 4} for quarters in quarters_by_year.values())

assert [row["year"] for row in price_annual] == list(range(2000, 2026))
assert len(price_annual) == price_checks["annual_observations"] == 26
assert all("status" not in row for row in price_annual)
price_by_year = {row["year"]: row for row in price_annual}
annual_means = {}
for year, quarters in quarters_by_year.items():
    annual_means[year] = {
        series: sum(quarters[quarter][f"{series}_index"] for quarter in range(1, 5)) / 4
        for series in ("nominal", "real")
    }
for year in range(2000, 2026):
    row = price_by_year[year]
    for series in ("nominal", "real"):
        mean_index = annual_means[year][series]
        expected_growth = 100 * (mean_index / annual_means[year - 1][series] - 1)
        assert math.isclose(row[f"{series}_index"], mean_index, rel_tol=0, abs_tol=1e-9)
        assert math.isclose(row[f"{series}_growth"], expected_growth, rel_tol=0, abs_tol=1e-9)

for series, expected_max_year, expected_min_year in (("nominal", 2003, 2012), ("real", 2003, 2012)):
    maximum = max(price_annual, key=lambda row: row[f"{series}_growth"])
    minimum = min(price_annual, key=lambda row: row[f"{series}_growth"])
    assert maximum["year"] == price_checks[f"{series}_max"]["year"] == expected_max_year
    assert minimum["year"] == price_checks[f"{series}_min"]["year"] == expected_min_year
    assert math.isclose(maximum[f"{series}_growth"], price_checks[f"{series}_max"]["value"], rel_tol=0, abs_tol=1e-9)
    assert math.isclose(minimum[f"{series}_growth"], price_checks[f"{series}_min"]["value"], rel_tol=0, abs_tol=1e-9)
latest_price = price_by_year[2025]
assert price_checks["latest"]["year"] == 2025
assert all(math.isclose(latest_price[key], price_checks["latest"][key], rel_tol=0, abs_tol=1e-9)
           for key in ("nominal_index", "real_index", "nominal_growth", "real_growth"))
assert round(latest_price["nominal_growth"], 6) == 12.701467
assert round(latest_price["real_growth"], 6) == 9.761658

example = data["illustrative_example"]
assert example["observed_data"] is False
a, b, c = example["scenarios"]
assert (a["quantity"], a["price_index"]) == (100, 100)
assert (b["quantity"], b["price_index"]) == (120, 80)
assert (c["quantity"], c["price_index"]) == (160, 120)
for row, demand_intercept, supply_intercept in [(a, 200, 0), (b, 200, 40), (c, 280, 40)]:
    assert row["quantity"] == demand_intercept - row["price_index"]
    assert row["quantity"] == row["price_index"] + supply_intercept
assert '<meta name="robots" content="index,follow">' in source
assert 'content="noindex' not in source.lower()
assert f'<meta property="article:published_time" content="{publication_date}">' in source
assert f'<time datetime="{publication_date}">4 de novembre de 2026</time>' in source
assert not re.search(r"Esborrany|Pendent de redacció|Material per a la redacció|drafts\.css|draft-(?:banner|body|factcheck)", source, re.I)
assert "{{" not in source and "<style" not in source
# Reuse shared parsers to apply the common published-article contract too.
contract = runpy.run_path(str(ROOT / "scripts/test-format-articles.py"))
tree = contract["Page"](source).root
body = contract["one"](tree.find(lambda n: n.has("article-body")), "article d’oferta i demanda")
assert set(body.attrs.get("class", "").split()) == {"article-body"}
construction = contract["one"](
    body.find(lambda n: n.tag == "section" and n.attrs.get("aria-labelledby") == "construccio"),
    "secció de construcció",
)
price_figure = contract["one"](
    construction.find(lambda n: n.tag == "figure" and n.attrs.get("id") == "preus-habitatge"),
    "gràfic de preus",
)
price_details = contract["one"](
    construction.find(lambda n: n.tag == "details" and n.attrs.get("id") == "dades-preus-habitatge"),
    "dades del gràfic de preus",
)
bank_paragraph = contract["one"](
    construction.find(lambda n: n.tag == "p" and contract["text_content"](n).strip().startswith("Alhora, el Banc d’Espanya estima")),
    "paràgraf del Banc d’Espanya",
)
construction_paragraph = contract["one"](
    construction.find(lambda n: n.tag == "p" and contract["text_content"](n).strip().startswith("La construcció anual no és")),
    "paràgraf anterior al gràfic d’habitatges",
)
housing_image = contract["one"](
    construction.find(
        lambda n: n.tag == "img"
        and n.attrs.get("src", "").split("?", 1)[0] == "/assets/charts/oferta-demanda/habitatges-acabats.svg"
    ),
    "gràfic d’habitatges acabats",
)
housing_figure = housing_image.parent.parent
assert housing_figure.tag == "figure" and housing_figure.parent is construction
chart_comment = contract["one"](
    construction.find(lambda n: n.tag == "p" and n.has("chart-comment")),
    "comentari del gràfic de preus",
)
assert construction_paragraph.parent is construction
assert construction.children.index(construction_paragraph) + 1 == construction.children.index(housing_figure), \
    "El paràgraf sobre l’oferta ha d’anar immediatament abans del gràfic d’habitatges"
assert all(node.parent is construction for node in (bank_paragraph, price_figure, price_details, chart_comment))
price_indices = [construction.children.index(node) for node in (bank_paragraph, price_figure, price_details, chart_comment)]
assert price_indices == list(range(price_indices[0], price_indices[0] + 4)), \
    "El gràfic de preus, les dades i el comentari han de seguir immediatament el paràgraf del Banc d’Espanya"

picture = contract["one"](price_figure.find(lambda n: n.tag == "picture"), "picture del gràfic de preus")
mobile_source = contract["one"](picture.find(lambda n: n.tag == "source"), "font mòbil del gràfic de preus")
price_image = contract["one"](picture.find(lambda n: n.tag == "img"), "imatge del gràfic de preus")
assert mobile_source.attrs.get("media") == "(max-width: 600px)"
assert mobile_source.attrs.get("srcset", "").split("?", 1)[0] == "/assets/charts/oferta-demanda/preus-habitatge-mobile.svg"
assert (mobile_source.attrs.get("width"), mobile_source.attrs.get("height")) == ("360", "390")
assert price_image.attrs.get("src", "").split("?", 1)[0] == "/assets/charts/oferta-demanda/preus-habitatge.svg"
assert (price_image.attrs.get("width"), price_image.attrs.get("height")) == ("760", "430")
assert price_image.attrs.get("loading") == "lazy" and price_image.attrs.get("decoding") == "async"
price_alt = price_image.attrs.get("alt", "").lower()
assert price_alt and "espanya" in price_alt and "2000" in price_alt and "2025" in price_alt
assert "nominal" in price_alt and "real" in price_alt
price_caption = contract["text_content"](contract["one"](price_figure.find(lambda n: n.tag == "figcaption"), "peu del gràfic de preus")).strip().lower()
assert "bis" in price_caption and "revis" in price_caption and "mitjan" in price_caption
assert "provisional" not in price_caption

price_table = contract["one"](price_details.find(lambda n: n.tag == "table"), "taula de preus")
price_head = contract["one"](price_table.find(lambda n: n.tag == "thead"), "capçalera de la taula de preus")
assert [contract["text_content"](n).strip() for n in price_head.find(lambda n: n.tag == "th")] == ["Any", "Nominal", "Real"]
price_tbody = contract["one"](price_table.find(lambda n: n.tag == "tbody"), "cos de la taula de preus")
price_rows = [node for node in price_tbody.children if node.tag == "tr"]
assert len(price_rows) == len(price_annual)

def percent_ca(value):
    sign = "+" if value > 0 else "−" if value < 0 else ""
    return sign + f"{abs(value):.1f}".replace(".", ",") + "%"

for node, row in zip(price_rows, price_annual):
    cells = [child for child in node.children if child.tag in {"th", "td"}]
    assert len(cells) == 3 and cells[0].tag == "th" and cells[0].attrs.get("scope") == "row"
    assert [cell.attrs.get("data-label") for cell in cells] == ["Any", "Nominal", "Real"]
    values = [contract["text_content"](cell).strip().replace(" %", "%") for cell in cells]
    assert values == [str(row["year"]), percent_ca(row["nominal_growth"]), percent_ca(row["real_growth"])]
price_download = contract["one"](
    price_details.find(lambda n: n.tag == "a" and n.attrs.get("href", "").split("?", 1)[0] == "/assets/data/oferta-demanda/preus-habitatge.json"),
    "descàrrega de les dades de preus",
)
assert "download" in price_download.attrs

for tbody in body.find(lambda n: n.tag == "tbody"):
    assert all(n.attrs.get("data-label") for n in tbody.find(lambda n: n.tag in {"th", "td"})), "Falten etiquetes de taula en mòbil"
title = contract["text_content"](contract["one"](tree.find(lambda n: n.tag == "h1"), "titular")).strip()
head_title = contract["text_content"](contract["one"](tree.find(lambda n: n.tag == "title"), "title")).strip()
assert head_title == title + " — L’Ardit", "Títol del navegador diferent del titular"
og_title = contract["one"](tree.find(lambda n: n.tag == "meta" and n.attrs.get("property") == "og:title"), "og:title")
assert og_title.attrs["content"] == title, "Títol social diferent del titular"
expected = ["#construccio", "#dues-corbes", "#demanda", "#conclusio"]
assert contract["check_section_headings"](body, "article d’oferta i demanda") == expected
toc = contract["one"](tree.find(lambda n: n.has("article-toc")), "menú")
assert [n.attrs["href"] for n in toc.find(lambda n: n.tag == "a")] == expected
contract["check_article_sharing"](body, title, canonical_url, "article d’oferta i demanda")
site = runpy.run_path(str(ROOT / "scripts/test-site.py"))
page_path = ROOT / route.strip("/") / "index.html"
page = site["Page"](source, route)
pages = {}
for p in ROOT.rglob("*.html"):
    if ".git" not in p.parts:
        pages[p] = site["Page"](p.read_text(encoding="utf-8"), str(p))
site["check_jsonld"](page)
site["check_metadata"](page, canonical_url)
site["check_links"](page, canonical_url, pages)
assert page.value("robots") == "index,follow"
assert page.value("article:section") == "Habitatge"
assert page.value("article:published_time") == publication_date
modified_date = page.value("article:modified_time")
assert date.fromisoformat(modified_date) >= date.fromisoformat(publication_date)
assert page.value("og:image") == page.value("twitter:image") == social_image_url
assert page.value("og:image:type") == "image/png"
assert (page.value("og:image:width"), page.value("og:image:height")) == ("1200", "679")
assert page.value("og:image:alt") == page.value("twitter:image:alt")
assert page.value("twitter:card") == "summary_large_image"
assert page.value("twitter:site") == page.value("twitter:creator") == "@Xavipalahi"

png = (ROOT / social_image_path.lstrip("/")).read_bytes()
assert png[:8] == b"\x89PNG\r\n\x1a\n" and png[12:16] == b"IHDR"
assert (int.from_bytes(png[16:20], "big"), int.from_bytes(png[20:24], "big")) == (1200, 679)

schema_nodes = []
for raw_schema in page.jsonld:
    document = json.loads(raw_schema)
    if isinstance(document, list):
        schema_nodes.extend(document)
    elif "@graph" in document:
        schema_nodes.extend(document["@graph"])
    else:
        schema_nodes.append(document)
article_schemas = [node for node in schema_nodes if node.get("@type") == "Article"]
assert len(article_schemas) == 1
article_schema = article_schemas[0]
assert article_schema["headline"] == title
assert article_schema["mainEntityOfPage"] == canonical_url
assert article_schema.get("url", canonical_url) == canonical_url
assert article_schema["datePublished"] == publication_date
assert article_schema["dateModified"] == modified_date
assert article_schema["image"] == social_image_url
assert article_schema["articleSection"] == "Habitatge"
assert article_schema["author"]["name"] == "Xavi Palahí"

byline = contract["one"](tree.find(lambda n: n.has("article-meta")), "metadades visibles de l’article")
byline_spans = byline.find(lambda n: n.tag == "span")
assert len(byline_spans) == 2
assert [contract["text_content"](node).strip() for node in byline_spans] == ["Per Xavi Palahí", "4 de novembre de 2026"]
byline_time = contract["one"](byline.find(lambda n: n.tag == "time"), "data visible de publicació")
assert byline_time.attrs.get("datetime") == publication_date

home_source = (ROOT / "index.html").read_text(encoding="utf-8")
home_tree = contract["Page"](home_source).root
home_cards = home_tree.find(lambda n: n.tag == "article" and n.has("home-story"))
assert len(home_cards) == 4
home_card = home_cards[0]
assert route in [n.attrs.get("href") for n in home_card.find(lambda n: n.tag == "a")]
assert contract["text_content"](contract["one"](home_card.find(lambda n: n.tag == "h2"), "titular de portada")).strip() == title
home_image = contract["one"](home_card.find(lambda n: n.tag == "img"), "imatge de portada")
assert home_image.attrs.get("src", "").split("?", 1)[0] == social_image_path
assert (home_image.attrs.get("width"), home_image.attrs.get("height")) == ("1200", "679")
home_time = contract["one"](home_card.find(lambda n: n.tag == "time"), "data de la targeta de portada")
assert home_time.attrs.get("datetime") == publication_date

home_documents = [json.loads(raw) for raw in re.findall(r'<script type="application/ld\+json">([\s\S]*?)</script>', home_source)]
home_lists = [document for document in home_documents if document.get("@type") == "ItemList"]
assert len(home_lists) == 1
home_list = home_lists[0]
assert home_list["numberOfItems"] == len(home_list["itemListElement"]) == 4
assert home_list["itemListElement"][0]["position"] == 1
assert home_list["itemListElement"][0]["name"] == title
assert home_list["itemListElement"][0]["url"] == canonical_url

housing_source = (ROOT / "articles/habitatge/index.html").read_text(encoding="utf-8")
housing_tree = contract["Page"](housing_source).root
housing_cards = housing_tree.find(lambda n: n.tag == "article" and n.has("story-card"))
assert len(housing_cards) == 2
housing_card = housing_cards[0]
assert route in [n.attrs.get("href") for n in housing_card.find(lambda n: n.tag == "a")]
assert contract["text_content"](contract["one"](housing_card.find(lambda n: n.tag == "h2"), "titular de categoria")).strip() == title
housing_card_image = contract["one"](housing_card.find(lambda n: n.tag == "img"), "imatge de la targeta de categoria")
assert housing_card_image.attrs.get("src", "").split("?", 1)[0] == social_image_path
assert (housing_card_image.attrs.get("width"), housing_card_image.attrs.get("height")) == ("1200", "679")
housing_time = contract["one"](housing_card.find(lambda n: n.tag == "time"), "data de la targeta de categoria")
assert housing_time.attrs.get("datetime") == publication_date

housing_documents = [json.loads(raw) for raw in re.findall(r'<script type="application/ld\+json">([\s\S]*?)</script>', housing_source)]
housing_collections = [document for document in housing_documents if document.get("@type") == "CollectionPage"]
assert len(housing_collections) == 1
housing_parts = housing_collections[0]["hasPart"]
if isinstance(housing_parts, dict):
    housing_parts = [housing_parts]
assert len(housing_parts) == 2
assert housing_parts[0]["headline"] == title and housing_parts[0]["url"] == canonical_url

articles_source = (ROOT / "articles/index.html").read_text(encoding="utf-8")
articles_tree = contract["Page"](articles_source).root
category_cards = articles_tree.find(lambda n: n.tag == "article" and n.has("story-card"))
assert len(category_cards) == 3
housing_category = contract["one"](
    [card for card in category_cards if "/articles/habitatge/" in [n.attrs.get("href") for n in card.find(lambda n: n.tag == "a")]],
    "targeta de la categoria Habitatge",
)
assert "Categoria · 2 articles" in contract["text_content"](housing_category)

ns_sitemap = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
sitemap = ET.parse(ROOT / "sitemap.xml").getroot()
sitemap_rows = sitemap.findall("s:url", ns_sitemap)
assert len(sitemap_rows) == 11
sitemap_dates = {
    row.find("s:loc", ns_sitemap).text: row.find("s:lastmod", ns_sitemap).text
    for row in sitemap_rows
}
assert sitemap_dates[canonical_url] == modified_date
for discovery_url in ("https://lardit.cat/", "https://lardit.cat/articles/", "https://lardit.cat/articles/habitatge/"):
    assert date.fromisoformat(sitemap_dates[discovery_url]) >= date.fromisoformat(publication_date)
for name, width, height in [("habitatges-acabats.svg", 760, 430), ("habitatges-acabats-mobile.svg", 360, 390)]:
    svg_source = (ROOT / "assets/charts/oferta-demanda" / name).read_text(encoding="utf-8")
    svg = ET.fromstring(svg_source)
    assert svg.attrib["width"] == str(width) and svg.attrib["height"] == str(height)
    assert svg.attrib["role"] == "img" and svg.attrib["aria-labelledby"] == "title desc"
    bars = [n for n in svg if n.tag.endswith("rect") and "data-year" in n.attrib]
    assert len(bars) == len(annual) and all(float(n.attrib["height"]) >= 0 for n in bars)
    assert [int(n.attrib["data-year"]) for n in bars] == [r["year"] for r in annual]
    assert [int(n.attrib["data-value"]) for n in bars] == [r["dwellings"] for r in annual]
    assert bars[-1].attrib["fill"] == "#ae372f" and "2025 (p): 93.650 habitatges" in svg_source
    ns = {"s": "http://www.w3.org/2000/svg"}
    axis = [n.text for n in svg.findall("s:text", ns) if n.text and re.fullmatch(r"20\d{2}", n.text)]
    assert axis == ["2000", "2005", "2010", "2015", "2020", "2025"]
    assert all(f'{r["year"]}: {r["dwellings"]:,}'.replace(",", ".") in svg_source for r in annual)

for name, width, height in [("preus-habitatge.svg", 760, 430), ("preus-habitatge-mobile.svg", 360, 390)]:
    svg_source = (ROOT / "assets/charts/oferta-demanda" / name).read_text(encoding="utf-8")
    svg = ET.fromstring(svg_source)
    ns = {"s": "http://www.w3.org/2000/svg"}
    assert svg.attrib["width"] == str(width) and svg.attrib["height"] == str(height)
    assert svg.attrib["role"] == "img" and svg.attrib["aria-labelledby"] == "title desc"
    svg_title = svg.find("s:title", ns)
    svg_desc = svg.find("s:desc", ns)
    assert svg_title is not None and svg_title.attrib.get("id") == "title" and (svg_title.text or "").strip()
    assert svg_desc is not None and svg_desc.attrib.get("id") == "desc" and (svg_desc.text or "").strip()
    description = (svg_title.text + " " + svg_desc.text).lower()
    assert "2000" in description and "2025" in description and "nominal" in description and "real" in description

    marks = [node for node in svg.iter() if node.tag.endswith("circle") and "data-series" in node.attrib]
    assert len(marks) == 52
    assert not [node for node in svg.iter() if node.tag.endswith("rect") and "data-year" in node.attrib]
    paths = [node for node in svg.iter() if node.tag.endswith("path") and "data-series" in node.attrib]
    assert [node.attrib["data-series"] for node in paths] == ["nominal", "real"]
    assert all(node.attrib.get("d") and node.attrib.get("fill") == "none" for node in paths)
    zero_lines = [node for node in svg.iter() if "price-zero" in node.attrib.get("class", "").split()]
    assert len(zero_lines) == 1 and zero_lines[0].tag.endswith("line")

    plot_top, plot_bottom = 110, height - 66
    expected_zero_y = plot_bottom - (0 - (-20)) / (20 - (-20)) * (plot_bottom - plot_top)
    assert math.isclose(float(zero_lines[0].attrib["y1"]), expected_zero_y, rel_tol=0, abs_tol=0.01)
    assert math.isclose(float(zero_lines[0].attrib["y2"]), expected_zero_y, rel_tol=0, abs_tol=0.01)
    for series in ("nominal", "real"):
        series_marks = [node for node in marks if node.attrib["data-series"] == series]
        assert [int(node.attrib["data-year"]) for node in series_marks] == list(range(2000, 2026))
        for node, row in zip(series_marks, price_annual):
            value = row[f"{series}_growth"]
            assert math.isclose(float(node.attrib["data-value"]), value, rel_tol=0, abs_tol=1e-9)
            expected_cy = plot_bottom - (value - (-20)) / (20 - (-20)) * (plot_bottom - plot_top)
            assert re.fullmatch(r"-?\d+\.\d{2}", node.attrib["cy"])
            assert math.isclose(float(node.attrib["cy"]), expected_cy, rel_tol=0, abs_tol=0.0051)
    axis = [node.text for node in svg.findall("s:text", ns) if node.text and re.fullmatch(r"20\d{2}", node.text)]
    assert axis == ["2000", "2005", "2010", "2015", "2020", "2025"]
    labels = {node.text.strip() for node in svg.findall("s:text", ns) if node.text}
    assert {"−20%", "0%", "+20%"} <= labels
    assert "2025 (p)" not in svg_source and "(p):" not in svg_source

print("PASS: article publicat i llistat; data original, imatge, metadades, dades, quatre gràfics, seccions i opcions de compartir coherents.")

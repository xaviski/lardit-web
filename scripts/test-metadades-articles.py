"""Ensure article bylines contain only author and original publication date."""
from html import unescape
from pathlib import Path
from datetime import date
import re

ROOT = Path(__file__).resolve().parents[1]


def plain(html):
    return " ".join(unescape(re.sub(r"<[^>]+>", " ", html)).split())


def publication(html):
    return re.search(r'<meta property="article:published_time" content="([^"]+)"', html).group(1)


def check_byline(byline, published):
    times = re.findall(r'<time datetime="([^"]+)">([^<]+)</time>', byline)
    assert len(times) == 1 and times[0][0] == published, byline
    date.fromisoformat(published)
    text = plain(byline)
    assert text.replace(" · ", " ") == "Per Xavi Palahí " + times[0][1], text
    assert not re.search(r"minuts?|lectura|estudis|Anàlisi", text, re.I), text


published = {}
for path in (ROOT / "articles").rglob("index.html"):
    html = path.read_text(encoding="utf-8")
    byline = re.search(r'<p class="article-meta"[^>]*>([\s\S]*?)</p>', html)
    if byline:
        assert not re.search(r"temps de lectura|\d+ minuts?", byline.group(0), re.I), path
    if '<meta property="og:type" content="article">' not in html or 'content="noindex' in html:
        continue
    assert byline, path
    published_at = publication(html)
    check_byline(byline.group(1), published_at)
    assert len(re.findall(r"<span>", byline.group(1))) == 2, path
    url = "/" + path.parent.relative_to(ROOT).as_posix() + "/"
    published[url] = published_at

assert len(published) >= 3
home = (ROOT / "index.html").read_text(encoding="utf-8")
home_cards = re.findall(r'<article class="home-story"[^>]*>([\s\S]*?)</article>', home)
assert len(home_cards) == min(5, len(published))
for card in home_cards:
    target = re.search(r'href="([^"]+)"', card).group(1)
    byline = re.search(r'<p class="home-story-meta">([\s\S]*?)</p>', card).group(1)
    check_byline(byline, published[target])
    assert len(re.findall(r"<span>", byline)) == 2

category_cards = 0
for path in (ROOT / "articles").glob("*/index.html"):
    html = path.read_text(encoding="utf-8")
    for card in re.findall(r'<article class="story-card story-card--illustrated"[^>]*>([\s\S]*?)</article>', html):
        target = re.search(r'<h2><a href="([^"]+)"', card).group(1)
        byline = re.search(r'<p class="card-meta">([\s\S]*?)</p>', card).group(1)
        check_byline(byline, published[target])
        category_cards += 1
assert category_cards == len(published)
print(f"PASS: {len(published)} article headers, {len(home_cards)} homepage cards and {category_cards} category cards show only author and original publication date; no reading-time placeholders remain.")

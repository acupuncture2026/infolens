"""RSS 采集模块"""

import feedparser
import httpx
from datetime import datetime
from typing import Optional
from .models import Article, Source


def fetch_rss(source: Source, max_entries: int = 20) -> list[Article]:
    """从 RSS 源抓取文章"""
    try:
        resp = httpx.get(source.feed_url, follow_redirects=True, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        print(f"  ✗ {source.name}: 抓取失败 — {e}")
        return []

    feed = feedparser.parse(resp.text)
    articles = []

    for entry in feed.entries[:max_entries]:
        pub = None
        if hasattr(entry, "published_parsed") and entry.published_parsed:
            try:
                pub = datetime(*entry.published_parsed[:6])
            except (ValueError, TypeError):
                pass

        article = Article(
            title=entry.get("title", "无标题"),
            url=entry.get("link", ""),
            source_id=source.id,
            source_name=source.name,
            published=pub,
            summary=entry.get("summary", ""),
            bias_direction=source.bias_direction,
        )
        articles.append(article)

    print(f"  ✓ {source.name}: 抓取 {len(articles)} 篇")
    return articles


def fetch_all(sources: list[Source], max_entries: int = 20) -> list[Article]:
    """从所有源抓取"""
    all_articles = []
    for source in sources:
        articles = fetch_rss(source, max_entries)
        all_articles.extend(articles)
    return all_articles

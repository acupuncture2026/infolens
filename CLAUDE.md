# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

InfoLens (信息透镜) is a search result quality annotation layer. It does **not** build a search engine — it annotates search results from existing engines (Tavily, Bing, Baidu, DDG) with human tags (good/spam/official/offtopic/deep/outdated) and produces domain credibility scores. The project is in Chinese; all UI text, comments, and commit messages are in Chinese.

**Vision**: 刺破幻相，看见真实 — Pierce through the illusion, see the truth.

**Origin**: 广东宠孚生物科技有限公司（成立于2021年，专注于基因检测、大数据管理和智能分析的高新技术企业）的官网 www.tronfo.com 在百度上搜索不到，哪怕搜"官网"也没有结果。搜索引擎被广告和SEO垃圾占据，真正的企业官网完全被埋没。这就是 InfoLens 要解决的问题。

## Architecture

The system has two parallel data paths that share the same SQLite database (`~/.infolens/infolens.db`):

### Path 1: Search Result Comparison & Annotation (`compare.py`, `api.py`, `__main__.py`)
- User searches a keyword → results come back from Tavily API (or manual input)
- Results are compared across engines (Tavily vs Baidu) with automatic labeling:
  - Both engines have it → credible
  - Only Baidu top-3 → suspicious SEO/bidding
  - Only Tavily → possibly suppressed by Baidu
  - Marked as ad → filtered
- Users annotate results with tags; tags aggregate into domain credibility scores

### Path 2: RSS Ingestion & Cross-Validation (`ingester.py`, `filter.py`, `default_sources.py`)
- Pre-configured RSS sources (Xinhua, Caixin, Reuters, BBC, 36Kr, Hacker News, etc.) are fetched via `feedparser`
- Articles are cross-validated: if 3+ independent sources cover the same topic → VERIFIED; 2 → PARTIAL; 1 → UNVERIFIED
- Emotionality analysis and bias direction tracking per source
- Topic grouping uses simple TF keyword extraction (no external NLP)

### Key modules
- `models.py` — Dataclasses: `SearchResult`, `UserTag`, `TagType` (enum), `DomainScore`. Also defines `Article`, `Source`, `BiasDirection`, `VerificationLevel` used by the RSS path.
- `database.py` — SQLite schema and CRUD for search results + user tags. DB location: `$INFOLENS_DATA` env var or `~/.infolens/`.
- `compare.py` — Has its own `init_db`/`save_result`/`save_tag` (parallel implementation with `search_results`, `user_tags`, `keywords` tables). Comparison engine with `_label()` and `_score()` functions.
- `consensus.py` — UGC consensus model: tags like `bias_flag`, `misleading`, `fact_check` trigger optimization strategies when ≥3 users agree.
- `api.py` — FastAPI app serving `web.html` (single-page vanilla HTML/JS frontend) + REST endpoints (`/api/stats`, `/api/compare`, `/api/tag`, `/api/tags/{url}`).
- `spiders/search.py` — Scrapy spider that scrapes Bing/Baidu/DDG search result pages directly (regex-based HTML parsing, not CSS selectors for Bing/Baidu).

### Dual database schemas
There are two `init_db` implementations that create slightly different schemas:
- `database.py`: `search_results(keyword, url, title, domain)`, `user_tags(result_id, url, tag_type, user_id)` — used by the annotation path
- `compare.py`: `search_results(keyword, url, title, snippet, source, rank, is_ad)`, `user_tags(url, tag_type, user_id)`, `keywords(keyword, category, priority)` — used by the comparison path

Both write to the same DB file. Be aware of schema conflicts when modifying either.

## Commands

```bash
# Install dependencies
pip install -e .
# Or manually:
pip install fastapi uvicorn feedparser httpx pyyaml jinja2 beautifulsoup4

# CLI (all commands require PYTHONPATH=src when not installed)
PYTHONPATH=src python -m infolens init                # Initialize DB + load default sources
PYTHONPATH=src python -m infolens search "关键词"      # Search via Tavily (needs TAVILY_API_KEY)
PYTHONPATH=src python -m infolens serve [port]         # Start web UI (default port 8787)
PYTHONPATH=src python -m infolens stats                # Show DB statistics

# Scrapy spider (from project root)
scrapy crawl search -a keyword="宠孚生物官网" -a engine=bing
# Engines: bing, baidu, ddg

# Cron fetch (scheduled RSS ingestion)
PYTHONPATH=src python scripts/cron_fetch.py
```

## Environment Variables

- `TAVILY_API_KEY` — Tavily Search API key for automated search. If unset, `search` command falls back to manual input mode.
- `INFOLENS_DATA` — Override default DB directory (`~/.infolens/`).

## Notes

- The `--standalone/` directory contains a separate Scrapy project (`scrapy.cfg` pointing to `crawler.settings`). This appears to be a legacy/alternate crawler setup distinct from the `spiders/` module.
- The root-level `settings.py` (`SPIDER_MODULES = ["spiders"]`) is a Scrapy settings file, not related to the FastAPI app.
- `web.html` is a self-contained single-page app (vanilla JS, no build step) served by FastAPI at `/`.
- No test suite exists.
- No linter/formatter is configured.

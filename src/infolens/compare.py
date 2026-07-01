"""
InfoLens — 搜索引擎对比标注器

架构：
  1. 用 web_search（Tavily）作为基准引擎，拿到干净结果
  2. 用户可手动贴入百度结果进行对比
  3. 自动标注：双边=可信，仅百度=可疑，仅Tavily=可能被压制

不做爬虫！用工具拿干净数据。
"""

import sqlite3
import os
import re
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Optional


# ── Database ──

def get_db_path():
    base = os.environ.get("INFOLENS_DATA", os.path.expanduser("~/.infolens"))
    os.makedirs(base, exist_ok=True)
    return os.path.join(base, "infolens.db")


def init_db(db_path: str = None):
    db_path = db_path or get_db_path()
    conn = sqlite3.connect(db_path, check_same_thread=False)
    c = conn.cursor()
    
    # 搜索结果
    c.execute("""
        CREATE TABLE IF NOT EXISTS search_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword TEXT NOT NULL,
            url TEXT NOT NULL,
            title TEXT DEFAULT '',
            snippet TEXT DEFAULT '',
            source TEXT NOT NULL,       -- tavily / baidu / manual
            rank INTEGER NOT NULL,
            is_ad INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(keyword, url, source)
        )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_kw ON search_results(keyword)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_url ON search_results(url)")
    
    # 用户标注
    c.execute("""
        CREATE TABLE IF NOT EXISTS user_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL,
            tag_type TEXT NOT NULL,
            user_id TEXT DEFAULT 'anon',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(url, tag_type, user_id)
        )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_tag_url ON user_tags(url)")
    
    # 关键词库
    c.execute("""
        CREATE TABLE IF NOT EXISTS keywords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword TEXT NOT NULL UNIQUE,
            category TEXT DEFAULT '',
            priority INTEGER DEFAULT 5,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    conn.commit()
    return conn


def save_result(conn, kw, url, title, snippet, source, rank, is_ad=False):
    c = conn.cursor()
    try:
        c.execute("""
            INSERT OR REPLACE INTO search_results
            (keyword, url, title, snippet, source, rank, is_ad)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (kw, url, title, snippet[:500], source, rank, 1 if is_ad else 0))
        conn.commit()
    except Exception:
        pass


def save_tag(conn, url, tag_type, user_id="anon"):
    c = conn.cursor()
    try:
        c.execute(
            "INSERT OR IGNORE INTO user_tags (url, tag_type, user_id) VALUES (?, ?, ?)",
            (url, tag_type, user_id)
        )
        conn.commit()
        return c.rowcount > 0
    except Exception:
        return False


def get_tags_for_url(conn, url):
    c = conn.cursor()
    c.execute("SELECT tag_type, COUNT(*) FROM user_tags WHERE url=? GROUP BY tag_type", (url,))
    return {r[0]: r[1] for r in c.fetchall()}


# ── Comparison Engine ──

def compare(tavily_results: list, baidu_results: list = None) -> list[dict]:
    """
    对比 Tavily 和 百度 搜索结果。
    
    标注逻辑：
    - 两边都有 → ✅ 真实相关
    - 仅 Tavily 有 → 🔍 百度可能压制
    - 仅百度有且前3 → ⚠️ 可疑 SEO/竞价
    - 百度标记广告 → 👎 过滤
    """
    t_urls = {r["url"]: r for r in tavily_results}
    b_urls = {r["url"]: r for r in (baidu_results or [])}
    all_urls = list(dict.fromkeys(list(t_urls.keys()) + list(b_urls.keys())))
    
    results = []
    for url in all_urls:
        t = t_urls.get(url)
        b = b_urls.get(url)
        
        label = _label(t, b)
        score = _score(t, b)
        
        results.append({
            "url": url,
            "title": (t or b).get("title", ""),
            "snippet": (t or b).get("snippet", ""),
            "domain": _domain(url),
            "tavily_rank": t.get("rank") if t else None,
            "baidu_rank": b.get("rank") if b else None,
            "is_ad": b.get("is_ad", False) if b else False,
            "label": label,
            "score": score,
        })
    
    results.sort(key=lambda x: x["score"])
    return results


def _label(t, b):
    if b and b.get("is_ad"):
        return "👎 广告"
    if t and b:
        if b["rank"] <= 3 and (not t or t["rank"] > 10):
            return "⚠️ 百度前3但Tavily无 → 可疑"
        if t["rank"] <= 3 and (not b or b["rank"] > 10):
            return "🔍 Tavily高但百度低 → 可能被压"
        return "✅ 双边"
    if t:
        return "🔍 仅Tavily"
    if b and b["rank"] <= 3:
        return "⚠️ 仅百度前3"
    return "— 仅百度"


def _score(t, b):
    """综合分数，越小越靠前"""
    t_r = t["rank"] if t else 99
    b_r = b["rank"] if b else 99
    if b and b.get("is_ad"):
        return 9999
    return t_r + b_r


def _domain(url):
    m = re.search(r'(?:https?://)?([^/?#]+)', url)
    return m.group(1) if m else ""

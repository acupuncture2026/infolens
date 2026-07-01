"""SQLite 数据库 — 极简版"""

import sqlite3
import os
from datetime import datetime
from typing import Optional
from .models import SearchResult, UserTag, TagType, DomainScore

DEFAULT_DB = "infolens.db"


def get_db_path(db_name: str = DEFAULT_DB) -> str:
    base = os.environ.get("INFOLENS_DATA", os.path.expanduser("~/.infolens"))
    os.makedirs(base, exist_ok=True)
    return os.path.join(base, db_name)


def init_db(db_path: Optional[str] = None):
    db_path = db_path or get_db_path()
    conn = sqlite3.connect(db_path, check_same_thread=False)
    c = conn.cursor()

    # 搜索结果表
    c.execute("""
        CREATE TABLE IF NOT EXISTS search_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword TEXT NOT NULL,
            url TEXT NOT NULL,
            title TEXT DEFAULT '',
            domain TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(keyword, url)
        )
    """)

    # 用户标注表
    c.execute("""
        CREATE TABLE IF NOT EXISTS user_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            result_id INTEGER NOT NULL,
            url TEXT NOT NULL,
            tag_type TEXT NOT NULL,
            user_id TEXT DEFAULT 'anon',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(url, tag_type, user_id)
        )
    """)

    c.execute("CREATE INDEX IF NOT EXISTS idx_results_keyword ON search_results(keyword)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_tags_url ON user_tags(url)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_tags_type ON user_tags(tag_type)")

    conn.commit()
    return conn


# ── Search Results ──

def save_result(conn, keyword: str, url: str, title: str = "") -> int:
    """保存搜索结果，返回 result_id"""
    # 自动提取域名
    domain = url.split("//")[-1].split("/")[0].split("?")[0] if url else ""
    c = conn.cursor()
    try:
        c.execute(
            "INSERT OR IGNORE INTO search_results (keyword, url, title, domain) VALUES (?, ?, ?, ?)",
            (keyword, url, title, domain)
        )
        conn.commit()
    except Exception:
        pass
    c.execute("SELECT id FROM search_results WHERE keyword=? AND url=?", (keyword, url))
    row = c.fetchone()
    return row[0] if row else 0


def load_results(conn, keyword: str = "", limit: int = 100) -> list[dict]:
    """加载搜索结果，附带标注统计"""
    c = conn.cursor()
    if keyword:
        c.execute("""
            SELECT sr.id, sr.keyword, sr.url, sr.title, sr.domain, sr.created_at
            FROM search_results sr
            WHERE sr.keyword LIKE ?
            ORDER BY sr.created_at DESC
            LIMIT ?
        """, (f"%{keyword}%", limit))
    else:
        c.execute("""
            SELECT sr.id, sr.keyword, sr.url, sr.title, sr.domain, sr.created_at
            FROM search_results sr
            ORDER BY sr.created_at DESC
            LIMIT ?
        """, (limit,))

    results = []
    for r in c.fetchall():
        result_id, kw, url, title, domain, created = r
        # 获取标注统计
        c2 = conn.cursor()
        c2.execute("SELECT tag_type, COUNT(*) FROM user_tags WHERE url=? GROUP BY tag_type", (url,))
        tags = {row[0]: row[1] for row in c2.fetchall()}

        results.append({
            "id": result_id,
            "keyword": kw,
            "url": url,
            "title": title,
            "domain": domain,
            "created_at": created,
            "tags": tags,
        })
    return results


# ── Tags ──

def add_tag(conn, result_id: int, url: str, tag_type: TagType, user_id: str = "anon") -> bool:
    """添加标注，返回是否成功（False = 已标注过）"""
    c = conn.cursor()
    try:
        c.execute(
            "INSERT OR IGNORE INTO user_tags (result_id, url, tag_type, user_id) VALUES (?, ?, ?, ?)",
            (result_id, url, tag_type.value, user_id)
        )
        conn.commit()
        return c.rowcount > 0
    except Exception:
        return False


def get_domain_scores(conn, domain: str = "") -> list[DomainScore]:
    """获取域名评分汇总"""
    c = conn.cursor()
    if domain:
        c.execute("""
            SELECT sr.domain,
                   SUM(CASE WHEN ut.tag_type='good' THEN 1 ELSE 0 END) as good,
                   SUM(CASE WHEN ut.tag_type='spam' THEN 1 ELSE 0 END) as spam,
                   SUM(CASE WHEN ut.tag_type='official' THEN 1 ELSE 0 END) as official,
                   SUM(CASE WHEN ut.tag_type='offtopic' THEN 1 ELSE 0 END) as offtopic
            FROM search_results sr
            LEFT JOIN user_tags ut ON sr.url = ut.url
            WHERE sr.domain LIKE ?
            GROUP BY sr.domain
            HAVING COUNT(ut.id) > 0
            ORDER BY (good + official) DESC
        """, (f"%{domain}%",))
    else:
        c.execute("""
            SELECT sr.domain,
                   SUM(CASE WHEN ut.tag_type='good' THEN 1 ELSE 0 END) as good,
                   SUM(CASE WHEN ut.tag_type='spam' THEN 1 ELSE 0 END) as spam,
                   SUM(CASE WHEN ut.tag_type='official' THEN 1 ELSE 0 END) as official,
                   SUM(CASE WHEN ut.tag_type='offtopic' THEN 1 ELSE 0 END) as offtopic
            FROM search_results sr
            LEFT JOIN user_tags ut ON sr.url = ut.url
            GROUP BY sr.domain
            HAVING COUNT(ut.id) > 0
            ORDER BY (good + official) DESC
        """)

    return [DomainScore(
        domain=r[0], good_count=r[1] or 0, spam_count=r[2] or 0,
        official_count=r[3] or 0, offtopic_count=r[4] or 0
    ) for r in c.fetchall()]


def get_stats(conn) -> dict:
    """获取统计"""
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM search_results")
    total_results = c.fetchone()[0]
    c.execute("SELECT COUNT(DISTINCT url) FROM user_tags")
    tagged_urls = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM user_tags")
    total_tags = c.fetchone()[0]
    c.execute("SELECT COUNT(DISTINCT domain) FROM search_results")
    total_domains = c.fetchone()[0]
    return {
        "total_results": total_results,
        "tagged_urls": tagged_urls,
        "total_tags": total_tags,
        "total_domains": total_domains,
    }

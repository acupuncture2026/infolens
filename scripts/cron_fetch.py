# -*- coding: utf-8 -*-
"""CRON: 每日定时抓取信源"""

import sys
import os

# 将 infolens 加入路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from infolens.database import init_db, save_source, save_article, load_sources
from infolens.ingester import fetch_all
from infolens.filter import cross_validate
from infolens.default_sources import default_sources


def run():
    db_path = os.path.expanduser("~/.infolens/infolens.db")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = init_db(db_path)

    # 如果没有信源，初始化
    sources = load_sources(conn)
    if not sources:
        for s in default_sources():
            save_source(conn, s)
        sources = load_sources(conn)

    articles = fetch_all(sources, max_entries=30)
    cross_validate(articles)

    for a in articles:
        save_article(conn, a)

    print(f"[cron] saved {len(articles)} articles")


if __name__ == "__main__":
    run()

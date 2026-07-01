"""InfoLens CLI — 搜索引擎对比标注器

用法:
  python -m infolens search <关键词>     — 用 Tavily 搜索
  python -m infolens serve [端口]         — 启动 Web
  python -m infolens init                 — 初始化
  python -m infolens stats                — 统计
"""

import sys
import os
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from infolens.compare import init_db, save_result, compare, save_tag, get_db_path


def do_search(keyword: str, max_results: int = 10):
    """
    用 Tavily API 搜索（需要 TAVILY_API_KEY）。
    如果没有 key，提示用户手动粘贴结果。
    """
    api_key = os.environ.get("TAVILY_API_KEY")
    if not api_key:
        print("⚠️ 未设置 TAVILY_API_KEY")
        print("请手动粘贴搜索结果，或设置环境变量后重试")
        print("\n手动输入格式（每行: 标题 | URL | [ad]）:")
        
        results = []
        i = 1
        while True:
            line = input(f"  [{i}] > ").strip()
            if not line:
                break
            parts = [p.strip() for p in line.split("|")]
            if len(parts) >= 2:
                is_ad = "ad" in parts[2].lower() if len(parts) > 2 else False
                results.append({
                    "url": parts[1],
                    "title": parts[0],
                    "snippet": "",
                    "rank": i,
                    "is_ad": is_ad,
                })
                i += 1
        
        return results
    
    # 有 API key，直接调 Tavily
    try:
        import httpx
        resp = httpx.post(
            "https://api.tavily.com/search",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"query": keyword, "max_results": max_results},
            timeout=15
        )
        resp.raise_for_status()
        data = resp.json()
        return [
            {
                "url": r["url"],
                "title": r.get("title", ""),
                "snippet": r.get("content", ""),
                "rank": i + 1,
                "is_ad": False,
            }
            for i, r in enumerate(data.get("results", []))
        ]
    except Exception as e:
        print(f"Tavily 搜索失败: {e}")
        return []


def main():
    conn = init_db()
    
    if len(sys.argv) < 2:
        print("InfoLens — 搜索引擎对比标注器")
        print()
        print("用法:")
        print("  search <关键词>    — 搜索并对比")
        print("  serve [端口]       — 启动 Web")
        print("  init               — 初始化数据库")
        print("  stats              — 统计")
        sys.exit(0)
    
    cmd = sys.argv[1]
    
    if cmd == "init":
        db_path = get_db_path()
        init_db(db_path)
        print(f"✓ 已初始化: {db_path}")
    
    elif cmd == "stats":
        c = conn.cursor()
        c.execute("SELECT COUNT(DISTINCT keyword) FROM search_results")
        kws = c.fetchone()[0]
        c.execute("SELECT COUNT(DISTINCT url) FROM search_results")
        urls = c.fetchone()[0]
        c.execute("SELECT COUNT(*) FROM search_results")
        total = c.fetchone()[0]
        print(f"\n📊 关键词: {kws} | URL: {urls} | 结果: {total}\n")
    
    elif cmd == "search":
        keyword = " ".join(sys.argv[2:])
        print(f"🔍 搜索: {keyword}")
        results = do_search(keyword)
        
        if not results:
            print("无结果")
            return
        
        # 保存
        for r in results:
            save_result(conn, keyword, r["url"], r["title"], r["snippet"], "tavily", r["rank"])
        
        # 打印
        print(f"\n{'='*70}")
        for i, r in enumerate(results, 1):
            ad = " 👎广告" if r.get("is_ad") else ""
            print(f"\n{i}. {r['title'][:50]}{ad}")
            print(f"   {r['url'][:60]}")
            if r.get("snippet"):
                print(f"   {r['snippet'][:100]}")
    
    elif cmd == "serve":
        import uvicorn
        port = int(sys.argv[2]) if len(sys.argv) > 2 else 8787
        from infolens.api import app
        print(f"InfoLens → http://localhost:{port}")
        uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
    
    else:
        print(f"未知命令: {cmd}")


if __name__ == "__main__":
    main()

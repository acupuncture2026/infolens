"""FastAPI — InfoLens 搜索引擎对比标注器"""

from pathlib import Path
from fastapi import FastAPI, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Optional
from .compare import init_db, save_result, compare, save_tag, get_tags_for_url, get_db_path

app = FastAPI(title="InfoLens")
conn = init_db()
HTML_TEMPLATE = Path(__file__).parent / "web.html"


@app.get("/", response_class=HTMLResponse)
def index():
    return HTML_TEMPLATE.read_text(encoding="utf-8")


# ── API ──

@app.get("/api/stats")
def api_stats():
    c = conn.cursor()
    c.execute("SELECT COUNT(DISTINCT keyword) FROM search_results")
    kws = c.fetchone()[0]
    c.execute("SELECT COUNT(DISTINCT url) FROM search_results")
    urls = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM search_results")
    total = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM user_tags")
    tags = c.fetchone()[0]
    return {"keywords": kws, "urls": urls, "total": total, "tags": tags}


class CompareRequest(BaseModel):
    keyword: str
    baidu_results: list[dict] = []  # 用户手动贴入: [{url, title, is_ad}]


@app.post("/api/compare")
def api_compare(req: CompareRequest):
    """
    对比搜索：后端用 Tavily 搜索 + 用户贴的百度结果
    """
    keyword = req.keyword
    
    # 用 Tavily 搜索（通过 web_search 工具，由上层调用）
    # 这里先返回空，实际由前端/CLI 调用 web_search 后传入
    return {"error": "请用 CLI 模式: python -m infolens search <关键词>"}


class TagRequest(BaseModel):
    url: str
    tag_type: str


@app.post("/api/tag")
def api_tag(req: TagRequest):
    ok = save_tag(conn, req.url, req.tag_type)
    return {"ok": ok}


@app.get("/api/tags/{url:path}")
def api_get_tags(url: str):
    return get_tags_for_url(conn, url)

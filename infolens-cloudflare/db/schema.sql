-- InfoLens D1 统一数据库 Schema
-- 合并 SQLite 的两个 schema (database.py + compare.py) 为一个干净的 D1 结构
-- 执行方式: npx wrangler d1 execute infolens --file=db/schema.sql

-- 用户表（匿名）
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_active TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 搜索结果（合并 database.py + compare.py）
CREATE TABLE IF NOT EXISTS search_results (
    id INTEGER PRIMARY KEY,
    keyword TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT DEFAULT '',
    snippet TEXT DEFAULT '',
    domain TEXT DEFAULT '',
    source TEXT DEFAULT '',
    rank INTEGER DEFAULT 0,
    is_ad INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(keyword, url, source)
);
CREATE INDEX IF NOT EXISTS idx_sr_keyword ON search_results(keyword);
CREATE INDEX IF NOT EXISTS idx_sr_url ON search_results(url);
CREATE INDEX IF NOT EXISTS idx_sr_domain ON search_results(domain);

-- 用户标注（以 URL 为中心，无 result_id FK）
CREATE TABLE IF NOT EXISTS user_tags (
    id INTEGER PRIMARY KEY,
    url TEXT NOT NULL,
    domain TEXT NOT NULL DEFAULT '',
    tag_type TEXT NOT NULL CHECK(tag_type IN ('good','spam','official','offtopic','deep','outdated')),
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(url, tag_type, user_id)
);
CREATE INDEX IF NOT EXISTS idx_ut_url ON user_tags(url);
CREATE INDEX IF NOT EXISTS idx_ut_domain ON user_tags(domain);

-- 域名评分（物化视图，写入时由 Worker 更新）
CREATE TABLE IF NOT EXISTS domain_scores (
    domain TEXT PRIMARY KEY,
    good_count INTEGER DEFAULT 0,
    spam_count INTEGER DEFAULT 0,
    official_count INTEGER DEFAULT 0,
    offtopic_count INTEGER DEFAULT 0,
    deep_count INTEGER DEFAULT 0,
    outdated_count INTEGER DEFAULT 0,
    total_tags INTEGER DEFAULT 0,
    credibility REAL DEFAULT 0.5,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 审计日志（共识追踪 + 防滥用）
CREATE TABLE IF NOT EXISTS tag_events (
    id INTEGER PRIMARY KEY,
    url TEXT NOT NULL,
    domain TEXT NOT NULL DEFAULT '',
    tag_type TEXT NOT NULL,
    action TEXT NOT NULL,  -- 'create' | 'delete'
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_te_url ON tag_events(url);
CREATE INDEX IF NOT EXISTS idx_te_domain ON tag_events(domain);
CREATE INDEX IF NOT EXISTS idx_te_user ON tag_events(user_id);

-- InfoLens 权威数据源种子数据
-- 已验证的官网和权威来源
-- 执行: npx wrangler d1 execute infolens --file=db/seed.sql

-- 插入已验证的官网（official 标签）
INSERT OR REPLACE INTO user_tags (url, domain, tag_type, user_id) VALUES
  ('https://www.tronfo.com/', 'tronfo.com', 'official', 'system'),
  ('https://www.stats.gov.cn/', 'stats.gov.cn', 'official', 'system'),
  ('https://www.gov.cn/', 'gov.cn', 'official', 'system'),
  ('https://www.people.com.cn/', 'people.com.cn', 'official', 'system'),
  ('https://www.xinhuanet.com/', 'xinhuanet.com', 'official', 'system'),
  ('https://www.chnmuseum.cn/', 'chnmuseum.cn', 'official', 'system');

-- 更新域名评分
INSERT OR REPLACE INTO domain_scores (domain, official_count, total_tags, credibility, updated_at) VALUES
  ('tronfo.com', 1, 1, 1.0, datetime('now')),
  ('stats.gov.cn', 1, 1, 1.0, datetime('now')),
  ('gov.cn', 1, 1, 1.0, datetime('now')),
  ('people.com.cn', 1, 1, 1.0, datetime('now')),
  ('xinhuanet.com', 1, 1, 1.0, datetime('now')),
  ('chnmuseum.cn', 1, 1, 1.0, datetime('now'));

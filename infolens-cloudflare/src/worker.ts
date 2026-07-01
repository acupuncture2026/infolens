/**
 * InfoLens Cloudflare Worker API
 *
 * REST API 为浏览器扩展提供标注数据查询和提交服务
 * 支持 CORS（chrome-extension:// / moz-extension://）
 *
 * 端点:
 *   POST /api/auth/register   — 注册匿名用户
 *   POST /api/batch-lookup    — 批量查询 URL 标注数据
 *   POST /api/tag             — 提交用户标注
 *   DELETE /api/tag/:url/:tag_type — 删除用户自己的标注
 *   GET  /api/consensus?url=  — 查看 URL 共识状态
 */

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const RATE_LIMIT = 50; // 每小时最多标注数
const CONSENSUS_THRESHOLD = 3; // 达成共识所需人数

// ── 路由 ──

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const path = url.pathname;

    try {
      if (path === '/api/auth/register' && request.method === 'POST') {
        return handleRegister(request, env);
      }
      if (path === '/api/batch-lookup' && request.method === 'POST') {
        return handleBatchLookup(request, env);
      }
      if (path === '/api/tag' && request.method === 'POST') {
        return handleTagSubmit(request, env);
      }
      if (path.startsWith('/api/tag/') && request.method === 'DELETE') {
        const parts = path.split('/').slice(3);
        const tagType = parts.pop()!;
        const urlParam = decodeURIComponent(parts.join('/'));
        return handleTagDelete(urlParam, tagType, request, env);
      }
      if (path === '/api/consensus' && request.method === 'GET') {
        return handleConsensus(url, env);
      }
      if (path === '/api/dump' && request.method === 'GET') {
        return handleDump(env);
      }

      // 默认 404
      return jsonResponse({ error: 'Not Found' }, 404);
    } catch (e: any) {
      console.error('Worker error:', e.message);
      return jsonResponse({ error: 'Internal Server Error' }, 500);
    }
  },
};

// ── 端点处理 ──

/**
 * GET /api/dump
 * 导出所有社区标注数据（供新安装的用户拉取）
 */
async function handleDump(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT url, domain, tag_type, COUNT(*) as count
     FROM user_tags
     GROUP BY url, tag_type
     ORDER BY count DESC
     LIMIT 10000`
  ).all<any>();

  const data: Record<string, any> = {};
  if (results) {
    for (const row of results) {
      if (!data[row.url]) {
        data[row.url] = {
          domain: row.domain,
          good: 0, spam: 0, official: 0, offtopic: 0, deep: 0, outdated: 0
        };
      }
      data[row.url][row.tag_type] = row.count;
    }
  }

  return jsonResponse({ urls: data, count: Object.keys(data).length });
}

/**
 * POST /api/auth/register
 * 注册或更新匿名用户
 */
async function handleRegister(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { user_id?: string };
  const userId = body.user_id || crypto.randomUUID();

  await env.DB.prepare(
    `INSERT OR REPLACE INTO users (id, last_active) VALUES (?, datetime('now'))`
  ).bind(userId).run();

  return jsonResponse({ ok: true, user_id: userId });
}

/**
 * POST /api/batch-lookup
 * 批量查询多个 URL/域名的标注数据
 *
 * 请求: { urls: string[], domains: string[] }
 * 响应: { urls: Record<url, UrlData>, domains: Record<domain, DomainScore> }
 */
async function handleBatchLookup(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { urls: string[], domains: string[], user_id?: string };
  const { urls, domains, user_id: userId } = body;

  const result: Record<string, any> = { urls: {}, domains: {} };

  // 查询域名评分
  if (domains && domains.length > 0) {
    const placeholders = domains.map(() => '?').join(',');
    const stmt = env.DB.prepare(
      `SELECT * FROM domain_scores WHERE domain IN (${placeholders})`
    ).bind(...domains);
    const { results } = await stmt.all<any>();

    if (results) {
      for (const row of results) {
        result.domains[row.domain] = {
          credibility: row.credibility,
          good_count: row.good_count,
          spam_count: row.spam_count,
          official_count: row.official_count,
          offtopic_count: row.offtopic_count,
          deep_count: row.deep_count,
          outdated_count: row.outdated_count,
          total_tags: row.total_tags,
          updated_at: row.updated_at,
        };
      }
    }
  }

  // 查询 URL 标注汇总
  if (urls && urls.length > 0) {
    for (const url of urls) {
      // 获取该 URL 的标注汇总
      const tagsStmt = env.DB.prepare(
        `SELECT tag_type, COUNT(*) as count FROM user_tags WHERE url = ? GROUP BY tag_type`
      ).bind(url);
      const { results: tagResults } = await tagsStmt.all<any>();

      const tags = tagResults
        ? tagResults.map((r: any) => ({ type: r.tag_type, count: r.count }))
        : [];

      // 获取域名评分（从 URL 提取域名）
      let domain = '';
      try { domain = new URL(url).hostname; } catch {}
      const domainScore = result.domains[domain] || null;

      // 获取当前用户的标注
      let userTag: string | null = null;
      if (userId) {
        const userStmt = env.DB.prepare(
          `SELECT tag_type FROM user_tags WHERE url = ? AND user_id = ? LIMIT 1`
        ).bind(url, userId);
        const { results: userResults } = await userStmt.all<any>();
        if (userResults && userResults.length > 0) {
          userTag = userResults[0].tag_type;
        }
      }

      // 检查共识状态
      const consensus = await checkConsensus(env.DB, url);

      result.urls[url] = {
        domain,
        domain_score: domainScore,
        tags,
        user_tag: userTag,
        consensus,
      };
    }
  }

  return jsonResponse(result);
}

/**
 * POST /api/tag
 * 提交用户标注
 *
 * 请求: { user_id, url, domain, tag_type }
 * 响应: { ok, domain_score, consensus }
 */
async function handleTagSubmit(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    user_id: string;
    url: string;
    domain: string;
    tag_type: string;
    keyword?: string;
  };

  const { user_id: userId, url, domain, tag_type, keyword } = body;

  if (!userId || !url || !tag_type) {
    return jsonResponse({ error: 'Missing required fields' }, 400);
  }

  // 速率限制检查
  const rateCheck = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM tag_events WHERE user_id = ? AND created_at > datetime('now', '-1 hour')`
  ).bind(userId).first<{ count: number }>();

  if (rateCheck && rateCheck.count >= RATE_LIMIT) {
    return jsonResponse({ error: 'Rate limit exceeded', limit: RATE_LIMIT }, 429);
  }

  // 插入标注（INSERT OR IGNORE = 同一用户同一 URL 同一类型只计一次）
  const tagResult = await env.DB.prepare(
    `INSERT OR IGNORE INTO user_tags (url, domain, tag_type, user_id) VALUES (?, ?, ?, ?)`
  ).bind(url, domain || '', tag_type, userId).run();

  // 记录审计事件
  await env.DB.prepare(
    `INSERT INTO tag_events (url, domain, tag_type, action, user_id) VALUES (?, ?, ?, 'create', ?)`
  ).bind(url, domain || '', tag_type, userId).run();

  // 更新域名评分
  const newScore = await updateDomainScore(env.DB, domain);

  // 检查共识
  const consensus = await checkConsensus(env.DB, url);

  // 保存关键词关联（可选）
  if (keyword && domain) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO search_results (keyword, url, title, domain, source) VALUES (?, ?, '', ?, 'extension')`
    ).bind(keyword, url, domain).run();
  }

  return jsonResponse({
    ok: true,
    was_new: tagResult.meta?.changes !== 0,
    domain_score: newScore,
    consensus,
  });
}

/**
 * DELETE /api/tag/:url/:tag_type
 * 删除用户自己的标注
 */
async function handleTagDelete(
  url: string,
  tagType: string,
  request: Request,
  env: Env
): Promise<Response> {
  // 从 query 或 body 获取 user_id
  const reqUrl = new URL(request.url);
  const userId = reqUrl.searchParams.get('user_id');

  if (!userId) {
    return jsonResponse({ error: 'user_id required' }, 400);
  }

  const result = await env.DB.prepare(
    `DELETE FROM user_tags WHERE url = ? AND tag_type = ? AND user_id = ?`
  ).bind(url, tagType, userId).run();

  // 记录审计事件
  let domain = '';
  try { domain = new URL(url).hostname; } catch {}

  await env.DB.prepare(
    `INSERT INTO tag_events (url, domain, tag_type, action, user_id) VALUES (?, ?, ?, 'delete', ?)`
  ).bind(url, domain, tagType, userId).run();

  // 更新域名评分
  const newScore = domain ? await updateDomainScore(env.DB, domain) : null;

  return jsonResponse({
    ok: true,
    deleted: result.meta?.changes !== 0,
    domain_score: newScore,
  });
}

/**
 * GET /api/consensus?url=
 * 查看某 URL 的共识状态
 */
async function handleConsensus(url: URL, env: Env): Promise<Response> {
  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) {
    return jsonResponse({ error: 'url parameter required' }, 400);
  }

  const consensus = await checkConsensus(env.DB, targetUrl);
  return jsonResponse({ url: targetUrl, consensus });
}

// ── 业务逻辑 ──

/**
 * 更新域名评分（在每次标注写入/删除后调用）
 */
async function updateDomainScore(db: D1Database, domain: string): Promise<any> {
  if (!domain) return null;

  // 重新计算该域名的所有标注统计
  const stats = await db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN tag_type='good' THEN 1 ELSE 0 END), 0) as good,
       COALESCE(SUM(CASE WHEN tag_type='spam' THEN 1 ELSE 0 END), 0) as spam,
       COALESCE(SUM(CASE WHEN tag_type='official' THEN 1 ELSE 0 END), 0) as official,
       COALESCE(SUM(CASE WHEN tag_type='offtopic' THEN 1 ELSE 0 END), 0) as offtopic,
       COALESCE(SUM(CASE WHEN tag_type='deep' THEN 1 ELSE 0 END), 0) as deep,
       COALESCE(SUM(CASE WHEN tag_type='outdated' THEN 1 ELSE 0 END), 0) as outdated,
       COUNT(*) as total
     FROM user_tags WHERE domain = ?`
  ).bind(domain).first<any>();

  if (!stats) return null;

  const total = stats.total || 0;
  const credibility = total > 0
    ? (stats.good + stats.official) / total
    : 0.5;

  await db.prepare(
    `INSERT OR REPLACE INTO domain_scores
     (domain, good_count, spam_count, official_count, offtopic_count, deep_count, outdated_count, total_tags, credibility, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).bind(
    domain,
    stats.good, stats.spam, stats.official, stats.offtopic, stats.deep, stats.outdated,
    total, credibility
  ).run();

  return {
    credibility,
    total_tags: total,
    good_count: stats.good,
    spam_count: stats.spam,
    official_count: stats.official,
    offtopic_count: stats.offtopic,
    deep_count: stats.deep,
    outdated_count: stats.outdated,
  };
}

/**
 * 检查某 URL 是否达成社区共识
 * ≥ CONSENSUS_THRESHOLD 个不同用户标记同类型 → agreed
 */
async function checkConsensus(db: D1Database, url: string): Promise<any> {
  const stmt = db.prepare(
    `SELECT tag_type, COUNT(DISTINCT user_id) as user_count
     FROM user_tags WHERE url = ?
     GROUP BY tag_type
     HAVING user_count >= ?
     ORDER BY user_count DESC
     LIMIT 1`
  ).bind(url, CONSENSUS_THRESHOLD);

  const result = await stmt.first<{ tag_type: string; user_count: number }>();

  if (!result) return null;

  return {
    type: result.tag_type,
    agreed: true,
    user_count: result.user_count,
    threshold: CONSENSUS_THRESHOLD,
  };
}

// ── 工具函数 ──

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}

// ── 类型声明 ──

interface Env {
  DB: D1Database;
}

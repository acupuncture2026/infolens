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
 *   GET  /api/dump            — 导出社区标注数据
 */

// ── CORS 控制 ──

const ALLOWED_EXTENSIONS = [
  'chrome-extension://',
  'moz-extension://',
  'safari-extension://',
  'safari-web-extension://',
];

const RATE_LIMIT = 50; // 每小时最多标注数
const CONSENSUS_THRESHOLD = 3; // 达成共识所需人数

/**
 * 允许的标注类型白名单
 */
const VALID_TAGS = ['good', 'spam', 'official', 'offtopic', 'deep', 'outdated'] as const;

/**
 * UUID v4 格式校验
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 验证请求 Origin，仅允许已知扩展源和同源 workers.dev
 * 返回安全的 Origin 值，若不合法则返回 null
 */
function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get('Origin');

  if (!origin) {
    // 无 Origin 头：允许同源请求（workers.dev / 自定义域名）
    const host = request.headers.get('Host') || '';
    return host.endsWith('.workers.dev') || host === '' ? 'same-origin' : null;
  }

  if (ALLOWED_EXTENSIONS.some(prefix => origin.startsWith(prefix))) {
    return origin;
  }

  // 同源 workers.dev
  try {
    const originUrl = new URL(origin);
    if (originUrl.hostname.endsWith('.workers.dev')) {
      return origin;
    }
  } catch { /* ignore parse errors */ }

  return null; // 拒绝未知来源
}

/**
 * 根据请求生成安全的 CORS 头
 */
function corsHeaders(request: Request): Record<string, string> {
  const origin = allowedOrigin(request);
  if (!origin) {
    return {
      'Access-Control-Allow-Origin': 'null',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };
  }

  return {
    'Access-Control-Allow-Origin': origin === 'same-origin' ? '*' : origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

// ── Dump 简单 IP 计数器（内存态，进程重启归零）──

const dumpRequestCounts: Map<string, number> = new Map();

/**
 * 检查 dump 端点的 IP 频率
 * 简单内存计数器：每分钟每 IP 最多 10 次
 * 返回 true 表示允许，false 表示超限
 */
function checkDumpRateLimit(ip: string): boolean {
  const key = ip || 'unknown';
  const count = dumpRequestCounts.get(key) || 0;
  if (count >= 10) {
    console.warn(`[dump-rate-limit] IP ${key} exceeded limit (${count} requests)`);
    return false;
  }
  dumpRequestCounts.set(key, count + 1);
  // 60 秒后自动重置（用 setTimeout 模拟窗口）
  setTimeout(() => { dumpRequestCounts.delete(key); }, 60_000);
  return true;
}

// ── 路由 ──

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) });
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
        return handleDump(request, env);
      }

      // 默认 404
      return jsonResponse({ error: 'Not Found' }, 404, request);
    } catch (e: any) {
      console.error('Worker error:', e.message);
      return jsonResponse({ error: 'Internal Server Error' }, 500, request);
    }
  },
};

// ── 端点处理 ──

/**
 * GET /api/dump
 * 导出社区标注数据（分页，供新安装的用户拉取）
 * 参数: ?offset=0&limit=1000
 */
async function handleDump(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')
    || 'unknown';

  if (!checkDumpRateLimit(ip)) {
    return jsonResponse({ error: 'Rate limit exceeded, try again later' }, 429, request);
  }

  const url = new URL(request.url);
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '1000'), 5000);

  // 修复 0.5.4: 直接按 URL 分组，所有 tag_type 聚合为列
  // 修复前: GROUP BY url, tag_type → 一行一个标签 → 与 COUNT(DISTINCT url) 分页错位
  const { results } = await env.DB.prepare(
    `SELECT url, domain,
       COALESCE(SUM(CASE WHEN tag_type='good' THEN 1 ELSE 0 END), 0) as good,
       COALESCE(SUM(CASE WHEN tag_type='spam' THEN 1 ELSE 0 END), 0) as spam,
       COALESCE(SUM(CASE WHEN tag_type='official' THEN 1 ELSE 0 END), 0) as official,
       COALESCE(SUM(CASE WHEN tag_type='offtopic' THEN 1 ELSE 0 END), 0) as offtopic,
       COALESCE(SUM(CASE WHEN tag_type='deep' THEN 1 ELSE 0 END), 0) as deep,
       COALESCE(SUM(CASE WHEN tag_type='outdated' THEN 1 ELSE 0 END), 0) as outdated
     FROM user_tags
     GROUP BY url
     ORDER BY (good + spam + official + offtopic + deep + outdated) DESC
     LIMIT ? OFFSET ?`
  ).bind(limit, offset).all<any>();

  // 获取总数（与数据查询同为 DISTINCT url，分页一致）
  const countResult = await env.DB.prepare(
    `SELECT COUNT(DISTINCT url) as total FROM user_tags`
  ).first<any>();

  const data: Record<string, any> = {};
  if (results) {
    for (const row of results) {
      data[row.url] = {
        domain: row.domain,
        good: row.good, spam: row.spam, official: row.official,
        offtopic: row.offtopic, deep: row.deep, outdated: row.outdated,
      };
    }
  }

  return jsonResponse({
    urls: data,
    count: Object.keys(data).length,
    total: countResult?.total || 0,
    offset,
    limit,
    hasMore: offset + limit < (countResult?.total || 0),
  }, 200, request);
}

/**
 * POST /api/auth/register
 * 注册或更新匿名用户
 */
async function handleRegister(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { user_id?: string };
  const userId = body.user_id || crypto.randomUUID();

  // 如果传入了 user_id，验证 UUID 格式
  if (body.user_id && !UUID_REGEX.test(body.user_id)) {
    return jsonResponse({ error: 'Invalid user_id format, expected UUID v4' }, 400, request);
  }

  await env.DB.prepare(
    `INSERT OR REPLACE INTO users (id, last_active) VALUES (?, datetime('now'))`
  ).bind(userId).run();

  return jsonResponse({ ok: true, user_id: userId }, 200, request);
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

  // ── 批量查询 URL 标注（修复 N+1）──
  if (urls && urls.length > 0) {
    // 单条 GROUP BY 查询获取所有 URL 的 tag 汇总
    const urlPlaceholders = urls.map(() => '?').join(',');
    const tagsStmt = env.DB.prepare(
      `SELECT url, tag_type, COUNT(*) as count
       FROM user_tags WHERE url IN (${urlPlaceholders})
       GROUP BY url, tag_type`
    ).bind(...urls);
    const { results: allTagResults } = await tagsStmt.all<any>();

    // 收集聚合结果
    const tagMap: Record<string, Array<{ type: string; count: number }>> = {};
    if (allTagResults) {
      for (const r of allTagResults) {
        if (!tagMap[r.url]) tagMap[r.url] = [];
        tagMap[r.url].push({ type: r.tag_type, count: r.count });
      }
    }

    // 批量查询当前用户的标注（一次 IN 查询代替 N 次单查）
    const userTagMap: Record<string, string> = {};
    if (userId) {
      const userStmt = env.DB.prepare(
        `SELECT url, tag_type FROM user_tags WHERE url IN (${urlPlaceholders}) AND user_id = ?`
      ).bind(...urls, userId);
      const { results: userResults } = await userStmt.all<any>();
      if (userResults) {
        for (const r of userResults) {
          userTagMap[r.url] = r.tag_type;
        }
      }
    }

    // 批量查询共识状态
    const consensusMap: Record<string, any> = {};
    const consensusStmt = env.DB.prepare(
      `SELECT url, tag_type, COUNT(DISTINCT user_id) as user_count
       FROM user_tags WHERE url IN (${urlPlaceholders})
       GROUP BY url, tag_type
       HAVING user_count >= ?`
    ).bind(...urls, CONSENSUS_THRESHOLD);
    const { results: consensusResults } = await consensusStmt.all<any>();
    if (consensusResults) {
      for (const r of consensusResults) {
        // 每个 URL 只保留票数最多的类型
        const existing = consensusMap[r.url];
        if (!existing || r.user_count > existing.user_count) {
          consensusMap[r.url] = {
            type: r.tag_type,
            agreed: true,
            user_count: r.user_count,
            threshold: CONSENSUS_THRESHOLD,
          };
        }
      }
    }

    // 组装结果
    for (const url of urls) {
      let domain = '';
      try { domain = new URL(url).hostname; } catch {}
      const domainScore = result.domains[domain] || null;

      result.urls[url] = {
        domain,
        domain_score: domainScore,
        tags: tagMap[url] || [],
        user_tag: userTagMap[url] || null,
        consensus: consensusMap[url] || null,
      };
    }
  }

  return jsonResponse(result, 200, request);
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

  // ── 输入校验 ──

  if (!userId || !url || !tag_type) {
    return jsonResponse({ error: 'Missing required fields' }, 400, request);
  }

  // 验证 user_id 为合法 UUID
  if (!UUID_REGEX.test(userId)) {
    return jsonResponse({ error: 'Invalid user_id format, expected UUID v4' }, 400, request);
  }

  // 验证 tag_type 在白名单中
  if (!VALID_TAGS.includes(tag_type as any)) {
    return jsonResponse({
      error: `Invalid tag_type: "${tag_type}". Must be one of: ${VALID_TAGS.join(', ')}`
    }, 400, request);
  }

  // 清理 URL：去除查询参数和锚点
  const cleanUrl = url.split('?')[0].split('#')[0];

  // 速率限制检查
  const rateCheck = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM tag_events WHERE user_id = ? AND created_at > datetime('now', '-1 hour')`
  ).bind(userId).first<{ count: number }>();

  if (rateCheck && rateCheck.count >= RATE_LIMIT) {
    return jsonResponse({ error: 'Rate limit exceeded', limit: RATE_LIMIT }, 429, request);
  }

  // 修复 0.5.4: 插入前先删旧标签（实现"每用户每 URL 单选"，支持改票）
  // 修复前: INSERT OR IGNORE → 用户换标签时旧标签永远残留 → 同一用户对同一 URL 挂多个标签
  const existing = await env.DB.prepare(
    `SELECT tag_type FROM user_tags WHERE url = ? AND user_id = ?`
  ).bind(cleanUrl, userId).all<any>();

  // 删除旧标签
  await env.DB.prepare(
    `DELETE FROM user_tags WHERE url = ? AND user_id = ?`
  ).bind(cleanUrl, userId).run();

  // 记录旧标签删除审计
  if (existing?.results?.length) {
    for (const row of existing.results) {
      await env.DB.prepare(
        `INSERT INTO tag_events (url, domain, tag_type, action, user_id) VALUES (?, ?, ?, 'delete', ?)`
      ).bind(cleanUrl, domain || '', row.tag_type, userId).run();
    }
  }

  // 插入新标签
  const tagResult = await env.DB.prepare(
    `INSERT OR IGNORE INTO user_tags (url, domain, tag_type, user_id) VALUES (?, ?, ?, ?)`
  ).bind(cleanUrl, domain || '', tag_type, userId).run();

  // 记录审计事件
  await env.DB.prepare(
    `INSERT INTO tag_events (url, domain, tag_type, action, user_id) VALUES (?, ?, ?, 'create', ?)`
  ).bind(cleanUrl, domain || '', tag_type, userId).run();

  // 更新域名评分
  const newScore = await updateDomainScore(env.DB, domain);

  // 检查共识
  const consensus = await checkConsensus(env.DB, cleanUrl);

  // 保存关键词关联（可选）
  if (keyword && domain) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO search_results (keyword, url, title, domain, source) VALUES (?, ?, '', ?, 'extension')`
    ).bind(keyword, cleanUrl, domain).run();
  }

  return jsonResponse({
    ok: true,
    was_new: tagResult.meta?.changes !== 0,
    domain_score: newScore,
    consensus,
  }, 200, request);
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
    return jsonResponse({ error: 'user_id required' }, 400, request);
  }

  // 验证 user_id 为合法 UUID
  if (!UUID_REGEX.test(userId)) {
    return jsonResponse({ error: 'Invalid user_id format, expected UUID v4' }, 400, request);
  }

  // 验证 tag_type 在白名单中
  if (!VALID_TAGS.includes(tagType as any)) {
    return jsonResponse({
      error: `Invalid tag_type: "${tagType}". Must be one of: ${VALID_TAGS.join(', ')}`
    }, 400, request);
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
  }, 200, request);
}

/**
 * GET /api/consensus?url=
 * 查看某 URL 的共识状态
 */
async function handleConsensus(url: URL, env: Env): Promise<Response> {
  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) {
    return jsonResponse({ error: 'url parameter required' }, 400, url as any);
  }

  const consensus = await checkConsensus(env.DB, targetUrl);
  return jsonResponse({ url: targetUrl, consensus }, 200, url as any);
}

// ── 业务逻辑 ──

/**
 * 更新域名评分（在每次标注写入/删除后调用）
 *
 * 使用 COUNT(DISTINCT user_id) 统计唯一用户数，避免同一用户多次操作
 * 被重复计数。利用 idx_ut_domain 索引加速查询。
 */
async function updateDomainScore(db: D1Database, domain: string): Promise<any> {
  if (!domain) return null;

  // 重新计算该域名的所有标注统计
  // 使用 COUNT(DISTINCT user_id) 替代 SUM/COUNT(*) 以统计唯一用户
  const stats = await db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN tag_type='good' THEN 1 ELSE 0 END), 0) as good,
       COALESCE(SUM(CASE WHEN tag_type='spam' THEN 1 ELSE 0 END), 0) as spam,
       COALESCE(SUM(CASE WHEN tag_type='official' THEN 1 ELSE 0 END), 0) as official,
       COALESCE(SUM(CASE WHEN tag_type='offtopic' THEN 1 ELSE 0 END), 0) as offtopic,
       COALESCE(SUM(CASE WHEN tag_type='deep' THEN 1 ELSE 0 END), 0) as deep,
       COALESCE(SUM(CASE WHEN tag_type='outdated' THEN 1 ELSE 0 END), 0) as outdated,
       COUNT(DISTINCT user_id) as unique_users
     FROM user_tags WHERE domain = ?`
  ).bind(domain).first<any>();

  if (!stats) return null;

  const uniqueUsers = stats.unique_users || 0;
  const credibility = uniqueUsers > 0
    ? (stats.good + stats.official) / uniqueUsers
    : 0.5;

  await db.prepare(
    `INSERT OR REPLACE INTO domain_scores
     (domain, good_count, spam_count, official_count, offtopic_count, deep_count, outdated_count, total_tags, credibility, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).bind(
    domain,
    stats.good, stats.spam, stats.official, stats.offtopic, stats.deep, stats.outdated,
    uniqueUsers, credibility
  ).run();

  return {
    credibility,
    total_tags: uniqueUsers,
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
 * >= CONSENSUS_THRESHOLD 个不同用户标记同类型 -> agreed
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

function jsonResponse(data: any, status = 200, request?: Request | URL): Response {
  const headers: Record<string, string> = request
    ? corsHeaders(request as Request)
    : {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      };

  headers['Content-Type'] = 'application/json';

  return new Response(JSON.stringify(data), { status, headers });
}

// ── 类型声明 ──

interface Env {
  DB: D1Database;
}

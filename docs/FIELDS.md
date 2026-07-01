# InfoLens — 参数字段完整参考

> 本文档记录所有参数字段的定义、值域、使用场景和传递过程。新增字段必须先更新本文档。

---

## 1. 数据存储模型

### 1.1 URL 标注条目（核心数据结构）

**存储位置**：`chrome.storage.local` → `infolens_persist`（JSON 字符串）

**Key**：完整 URL 字符串，如 `"https://www.tronfo.com/"`

**Value 结构**：

| 字段 | 类型 | 示例值 | 说明 |
|------|------|--------|------|
| `good` | `number` | `3` | 被标记"值得看"的次数 |
| `spam` | `number` | `0` | 被标记"垃圾"的次数 |
| `official` | `number` | `1` | 被标记"官网"的次数 |
| `offtopic` | `number` | `0` | 被标记"偏题"的次数 |
| `deep` | `number` | `2` | 被标记"深度"的次数 |
| `outdated` | `number` | `0` | 被标记"过时"的次数 |
| `domain` | `string` | `"tronfo.com"` | 规范化域名（去 www） |
| `userVote` | `string \| null` | `"good"` | 当前用户的标注类型（6 种之一或 null） |

**完整示例**：
```json
{
  "https://www.tronfo.com/": {
    "good": 3, "spam": 0, "official": 1,
    "offtopic": 0, "deep": 2, "outdated": 0,
    "domain": "tronfo.com",
    "userVote": "good"
  }
}
```

### 1.2 标注类型枚举（6 种）

| key | emoji | 权重 | 含义 |
|-----|-------|------|------|
| `good` | 👍 | +100 | 内容质量高，信息准确 |
| `official` | 📋 | +100 | 官方来源，权威可信 |
| `deep` | 🔍 | +50 | 有深度分析，值得细读 |
| `offtopic` | ⚠️ | -50 | 标题党、与搜索意图不符 |
| `outdated` | 📅 | -25 | 信息已过时 |
| `spam` | 👎 | -100 | SEO 垃圾、广告、内容农场 |

---

## 2. 评分算法

### 2.1 加权评分

```
rawScore = good×100 + official×100 + deep×50 + offtopic×(-50) + outdated×(-25) + spam×(-100)
display = rawScore  （无上限，范围约 -500 ~ +500）
total = 所有标注次数之和
```

### 2.2 评分颜色分级

| 分数范围 | 颜色 | 含义 |
|----------|------|------|
| ≥ +400 | `#1b5e20` 深绿 | 大量认可 |
| ≥ +200 | `#2e7d32` 绿 | 多人认可 |
| ≥ +100 | `#43a047` 浅绿 | 正面 |
| ≥ +50 | `#7cb342` 黄绿 | 较好 |
| ≥ +10 | `#f9a825` 黄 | 中立 |
| ≥ -10 | `#fdd835` 浅黄 | 轻微负面 |
| ≥ -50 | `#e65100` 橙 | 偏负 |
| ≥ -100 | `#d84315` 深橙 | 差评 |
| ≥ -200 | `#c62828` 红 | 垃圾 |
| < -200 | `#b71c1c` 深红 | 严重垃圾 |

---

## 3. 消息通信协议

### 3.1 Content Script → Service Worker

| 消息类型 | data 结构 | 响应 |
|----------|-----------|------|
| `GET_ALL` | — | 返回完整 store 对象 |
| `VOTE` | `{ url, domain, tagType }` | 返回更新后的 entry |
| `EXPORT` | — | `{ data, exportedAt }` |
| `IMPORT` | `{ url: entry, ... }` | `{ ok: true }` |
| `CLEAR` | — | `{ ok: true }` |
| `STATS` | — | `{ totalUrls, votedUrls, domains, cloudSynced }` |

### 3.2 Service Worker → Content Script

| 消息类型 | data | 触发时机 |
|----------|------|----------|
| `DATA_CHANGED` | 完整 store 对象 | 投票后 / 云端拉取后 / 清除后 |

---

## 4. 云端 API

### 4.1 基础 URL

```
https://infolens-api.leokin.workers.dev
```

### 4.2 端点

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/api/tag` | 提交标注 |
| POST | `/api/batch-lookup` | 批量查询 |
| GET | `/api/dump` | 导出所有社区数据 |
| POST | `/api/auth/register` | 注册用户 |
| DELETE | `/api/tag/:url/:tag_type` | 删除标注 |

### 4.3 POST /api/tag 请求体

| 字段 | 类型 | 必填 | 示例 | 说明 |
|------|------|------|------|------|
| `user_id` | `string` | ✅ | `"uuid-v4-xxx"` | 匿名用户 ID |
| `url` | `string` | ✅ | `"https://www.tronfo.com/"` | 完整 URL |
| `domain` | `string` | ✅ | `"tronfo.com"` | 规范化域名 |
| `tag_type` | `string` | ✅ | `"good"` | 标注类型（6 种之一） |

### 4.4 GET /api/dump 响应体

```json
{
  "urls": {
    "https://www.tronfo.com/": {
      "domain": "tronfo.com",
      "good": 3, "spam": 0, "official": 1,
      "offtopic": 0, "deep": 2, "outdated": 0
    }
  },
  "count": 1
}
```

---

## 5. 数据库结构（Cloudflare D1）

### 5.1 user_tags 表

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| `id` | INTEGER | PRIMARY KEY | 自增 ID |
| `url` | TEXT | NOT NULL | 完整 URL |
| `domain` | TEXT | NOT NULL DEFAULT '' | 规范化域名 |
| `tag_type` | TEXT | NOT NULL, CHECK(...) | 标注类型（6 种） |
| `user_id` | TEXT | NOT NULL | 匿名用户 ID |
| `created_at` | TEXT | DEFAULT now | 创建时间 |

**唯一约束**：`UNIQUE(url, tag_type, user_id)` — 同一用户对同一 URL 同一类型只能标注一次

### 5.2 domain_scores 表（物化）

| 列 | 类型 | 说明 |
|----|------|------|
| `domain` | TEXT | PRIMARY KEY，规范化域名 |
| `good_count` | INTEGER | 👍 总数 |
| `spam_count` | INTEGER | 👎 总数 |
| `official_count` | INTEGER | 📋 总数 |
| `offtopic_count` | INTEGER | ⚠️ 总数 |
| `deep_count` | INTEGER | 🔍 总数 |
| `outdated_count` | INTEGER | 📅 总数 |
| `total_tags` | INTEGER | 总标注数 |
| `credibility` | REAL | 可信度 0~1 |
| `updated_at` | TEXT | 最后更新时间 |

---

## 6. 本地存储

| Key | 位置 | 类型 | 说明 |
|-----|------|------|------|
| `infolens_persist` | `chrome.storage.local` | JSON string | 持久化标注数据 |
| `userId` | `chrome.storage.local` | UUID string | 匿名用户 ID |
| `lastCommitSha` | `chrome.storage.local` | Git SHA | 上次检查的 GitHub commit |
| `__il_cache` | `localStorage` | JSON string | 内容脚本的缓存副本 |

---

## 7. 多语言支持

支持 10 种语言，通过 `navigator.language` 自动检测：

| 代码 | 语言 | 示例 |
|------|------|------|
| `zh` | 中文 | 👍 值得看 |
| `en` | 英语 | 👍 Good |
| `ja` | 日语 | 👍 良質 |
| `ko` | 韩语 | 👍 양호 |
| `fr` | 法语 | 👍 Bon |
| `de` | 德语 | 👍 Gut |
| `es` | 西班牙语 | 👍 Bueno |
| `pt` | 葡萄牙语 | 👍 Bom |
| `ru` | 俄语 | 👍 Хорошо |
| `ar` | 阿拉伯语 | 👍 جيد |

---

## 8. 数据传递流程

```
用户点击标注按钮
    │
    ▼
content script: vote(url, domain, tagType)
    │
    ├──→ 更新 localCache（即时响应）
    │
    └──→ chrome.runtime.sendMessage('VOTE')
              │
              ▼
         service worker
              │
              ├──→ 更新 store 内存
              ├──→ chrome.storage.local.set（持久化）
              ├──→ chrome.runtime.sendMessage('DATA_CHANGED')
              │         │
              │         ▼
              │    所有 content script 刷新 UI
              │
              └──→ fetch('/api/tag')（云端同步）
                        │
                        ▼
                   Cloudflare Worker → D1 数据库
```

---

## 9. 新增字段规则

1. **先在本文档定义**：字段名、类型、值域、使用场景
2. **说明传递过程**：从哪个组件产生 → 经过哪些组件 → 存储在哪里
3. **更新所有相关文件**：store.js、service-worker.js、worker.ts、schema.sql
4. **更新 README.md**：如有用户可见的变化
5. **提交时说明**：commit message 中写明新增了什么字段

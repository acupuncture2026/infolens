# InfoLens — 信息透镜

> **刺破幻相，看见真实。**

不做搜索引擎，只做搜索结果的质量标注。

**官网**：[www.tronfo.com](https://www.tronfo.com)（宠孚生物官方网站）

---

## 问题

- 百度搜"官网"，结果排到第3页都是广告和SEO垃圾
- AI搜索消耗大量算力，还不如人眼精准
- 搜索引擎的KPI是停留时长和转化率，不是信息质量
- **真正的官网可能被埋在搜索结果第10条以后**

### 真实案例：搜索"宠孚生物官网"

广东宠孚生物科技有限公司成立于 2021 年，是一家专注于基因检测、大数据管理和智能分析的高新技术企业。官网 [www.tronfo.com](https://www.tronfo.com)。

公司在百度搜索"宠孚生物官网"，结果排到第3页都是广告和SEO垃圾，真正的官网 [www.tronfo.com](https://www.tronfo.com) 根本搜不到。

| 搜索引擎 | 第1条结果 | 真正的官网在哪 |
|----------|-----------|----------------|
| 百度 | 宠孚宠物用品（无关公司） | 不在前10条 |
| Tavily | 万孚生物官网-建站公司案例 | 不在前10条 |
| Bing | 芒果TV（完全不相关） | 未找到 |

搜索引擎不知道 [www.tronfo.com](https://www.tronfo.com) 是宠孚生物的官网。哪怕搜索"官网"，都搜不到真正的结果。这将极大地误导搜索者。

**但人知道。**

---

## 解决方案

**你搜索，我们标注。**

```
你在任何搜索引擎搜索 → 拿到链接列表
                            ↓
              InfoLens 标注层：这个页面值不值得看？
              👍 值得看  👎 垃圾  📋 官网  ⚠️ 偏题
                            ↓
              你的标注 + 社区标注 → 越用越准
```

---

## 标注类型

| 标记 | 含义 | 共识效果 |
|------|------|----------|
| 👍 值得看 | 内容质量高，信息准确 | 提升该域名评分 |
| 👎 垃圾 | SEO垃圾、广告、内容农场 | 降低该域名评分 |
| 📋 官网 | 官方来源，权威可信 | 标记为可信源 |
| ⚠️ 偏题 | 标题党、与搜索意图不符 | 降低排序权重 |
| 🔍 深度 | 有深度分析，值得细读 | 优先展示 |
| 📅 过时 | 信息已更新 | 标记过时 |

---

## 浏览器扩展（v0.5）

### 安装

1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `infolens-extension/` 目录

### 功能

**任何网页** → 右侧竖排浮动栏，显示评分 + 6 个标注按钮

```
┌────────┐
│  100   │ ← 域名评分
│ 👍 值得看 │
│ 👎 垃圾  │
│ 📋 官网  │
│ ⚠️ 偏题  │
│ 🔍 深度  │
│ 📅 过时  │
└────────┘
```

**搜索引擎结果页** → 每个结果标题旁横排显示评分和标注按钮

支持：百度、Bing（国内版/国际版）、Google、DuckDuckGo

### 架构

```
┌─────────────────────────────────────────┐
│  内容脚本（所有网页自动加载）              │
│  ├─ 页面右侧浮动栏（评分 + 竖排按钮）       │
│  ├─ 搜索结果注入横排徽章                 │
│  └─ URL 翻页自动重新注入                 │
└───────────────┬─────────────────────────┘
                │ chrome.runtime.sendMessage
                ▼
┌─────────────────────────────────────────┐
│  Service Worker（数据中枢）               │
│  ├─ 内存存储所有标注数据                  │
│  ├─ chrome.storage.local 持久化          │
│  └─ 实时广播数据变更 → 所有标签页同步      │
└───────────────┬─────────────────────────┘
                │ fetch
                ▼
┌─────────────────────────────────────────┐
│  Cloudflare Worker + D1                  │
│  ├─ POST /api/batch-lookup  批量查询      │
│  ├─ POST /api/tag           社区同步      │
│  └─ D1 物化域名评分表                     │
└─────────────────────────────────────────┘
```

### 开发

```bash
# 直接加载 infolens-extension/ 即可使用
# 数据通过 Service Worker 跨域共享

# 部署云端 API
cd infolens-cloudflare
npm install
npx wrangler deploy --minify
```

### 多语言

自动跟随系统语言，支持 10 种语言：中文、英语、日语、韩语、法语、德语、西班牙语、葡萄牙语、俄语、阿拉伯语。

---

## 快速开始（Python Web）

```bash
cd infolens
pip install -e .

# 初始化数据库
PYTHONPATH=src python -m infolens init

# 启动 Web 界面
PYTHONPATH=src python -m infolens serve
# → http://localhost:8787
```

### CLI 模式

```bash
PYTHONPATH=src python -m infolens search "宠孚生物官网"
PYTHONPATH=src python -m infolens stats
```

### Scrapy 爬虫（可选）

```bash
scrapy crawl search -a keyword="宠孚生物官网" -a engine=bing
```

---

## 技术栈

- **浏览器扩展**：Manifest V3 / Content Scripts / Service Worker
- **后端**：Python 3.10+ / FastAPI
- **云端**：Cloudflare Worker + D1
- **前端**：原生 HTML + JavaScript（零构建）
- **协议**：MIT 开源

---

## 项目架构

```
infolens/
├── src/infolens/
│   ├── __main__.py      # CLI 入口
│   ├── api.py           # FastAPI 路由 + Web 服务
│   ├── web.html         # 单页前端（零构建）
│   ├── models.py        # 数据模型
│   ├── database.py      # SQLite 数据层
│   ├── compare.py       # 搜索引擎对比引擎
│   ├── consensus.py     # 社区共识模型
│   ├── filter.py        # 交叉验证 + 情绪化分析
│   ├── ingester.py      # RSS 采集
│   └── default_sources.py  # 预设信源
├── infolens-extension/  # 浏览器扩展
│   ├── manifest.json
│   ├── src/
│   │   ├── background/   # Service Worker（数据中枢）
│   │   ├── content/      # 内容注入器
│   │   ├── popup/        # 弹出面板
│   │   └── shared/       # 多语言 + 数据存储
│   └── assets/
├── infolens-cloudflare/ # Cloudflare Worker
│   ├── src/worker.ts    # REST API
│   ├── db/schema.sql    # D1 数据库结构
│   └── wrangler.toml
├── spiders/search.py    # Scrapy 爬虫
└── scripts/cron_fetch.py   # 定时 RSS 采集
```

---

## 路线图

### 近期（v0.3 → v0.5）

- [x] v0.1 — 标注数据库 + Web 界面
- [x] v0.2 — 搜索引擎对比（Tavily + 百度）
- [x] v0.3 — 用户标注 + 共识引擎
- [x] v0.4 — 浏览器插件（内容脚本 + 本地存储）
- [x] v0.5 — 浏览器插件（Service Worker 数据中枢 + Cloudflare D1）
  - [x] 所有网页右侧浮动标注栏
  - [x] 搜索引擎结果横排徽章
  - [x] 跨域数据同步
  - [x] 10 种语言自动切换
  - [x] 翻页自动重新注入
  - [ ] Google 完整支持
  - [ ] Firefox 兼容

### 中期（v0.6 → v0.8）

- [ ] v0.6 — 个人常识数据库（本地优先）
- [ ] v0.7 — 社区共识同步（Cloudflare D1 全球边缘读取）
- [ ] v0.8 — 自循环搜索（先查标注库 → 呈现已标注结果）

### 远期探索（v0.9+）

- [ ] v0.9 — 开源浏览器探索（基于 Chromium 内核嵌入标注层）
- [ ] v1.0 — 正式版

---

## 参数字段参考

完整的参数字段定义、值域、传递流程见 [docs/FIELDS.md](docs/FIELDS.md)。

**核心数据结构**：
```
URL → { good, spam, official, offtopic, deep, outdated, domain, userVote }
```

**评分范围**：-500 ~ +500，10 级色阶（深红→深绿）

---

## 贡献

欢迎加入！无论你是开发者、编辑、研究者，还是每一个不愿意被算法饲养的普通人。

📧 cvlk@163.com

---

*InfoLens v0.5 · 2026 · 让信息回归透明*

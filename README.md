# InfoLens — 信息透镜

> **刺破幻相，看见真实。**

不做搜索引擎，只做搜索结果的质量标注。

**官网**：[www.tronfo.com](https://www.tronfo.com)（宠孚生物官方网站）

---

## 快速开始

### 方式一：安装浏览器扩展（推荐）

**Chrome / Edge：**
1. 打开 `chrome://extensions/`（Edge 用 `edge://extensions/`）
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `infolens-extension/` 目录

**Firefox：**
1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击「临时载入附加组件」
3. 选择 `infolens-extension/manifest-firefox.json`

安装后，浏览任何网页时右侧会出现浮动标注栏，搜索结果页每个标题旁会显示评分徽章。

### 方式二：部署云端服务（自托管）

如果你不想使用默认的共享 API，可以自行部署 Cloudflare Worker：

```bash
# 1. Fork 本仓库并克隆
git clone https://github.com/<你的用户名>/infolens.git
cd infolens

# 2. 安装 Wrangler（Cloudflare CLI）
npm install -g wrangler

# 3. 登录 Cloudflare
wrangler login

# 4. 部署 Worker + 创建 D1 数据库
cd infolens-cloudflare
wrangler d1 create infolens-prod
# 将输出的 database_id 填入 wrangler.toml 的 [[d1_databases]] binding 中
wrangler d1 execute infolens-prod --file db/schema.sql
npx wrangler deploy --minify

# 5. 记录 Worker URL，如 https://infolens-xxx.yourname.workers.dev
```

部署完成后，在扩展中配置自定义 API 地址：
1. 点击扩展图标打开面板
2. 进入「设置」
3. 填写「自定义 API 地址」为 Worker URL（无需尾斜杠）
4. 保存即可

### 方式三：本地 Python Web

```bash
cd infolens
pip install -e .

# 初始化数据库
PYTHONPATH=src python -m infolens init

# 启动 Web 界面
PYTHONPATH=src python -m infolens serve
# → http://localhost:8787
```

---

## 为什么做这件事

作为一个小企业的运营人员，我们常常遇到这样的困惑：

- 搜索自己公司的名字，真正的官网却找不到
- 搜索结果里排在前面的，往往不是最有价值的信息
- 搜索引擎的排序逻辑服务于它们的商业模式，而不是信息质量

**真正的官网，可能被埋在搜索结果的第10条以后。**

**但人知道哪个是真的。**

### 真实案例：搜索"宠孚生物官网"

广东宠孚生物科技有限公司成立于 2021 年，是一家专注于基因检测、大数据管理和智能分析的高新技术企业。官网 [www.tronfo.com](https://www.tronfo.com)。

在几个主流搜索引擎上搜索"宠孚生物官网"，真正的官网都不在前10条结果中。这不是某个搜索引擎的问题，而是所有搜索引擎共同面临的困境 — 它们无法像人一样理解"官网"这个词在特定语境下的真实含义。

这正是 InfoLens 想要做的事：**把人知道的，变成搜索引擎也能看见的。**

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

## 浏览器扩展（v0.5.6）

### 安装

**Chrome / Edge：**
1. 打开 `chrome://extensions/`（Edge 用 `edge://extensions/`）
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `infolens-extension/` 目录

**Firefox：**
1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击「临时载入附加组件」
3. 选择 `infolens-extension/manifest-firefox.json`

### 功能

**任何网页** → 右侧竖排浮动栏，显示评分 + 6 个标注按钮

```
┌────────┐
│  100   │ ← 域名评分
│ 👍 值得看 │
│ 📋 官网  │
│ ⚠️ 偏题  │
│ 👎 垃圾  │
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

## CLI 模式

```bash
PYTHONPATH=src python -m infolens search "宠孚生物官网"
PYTHONPATH=src python -m infolens stats
```

## Scrapy 爬虫（可选）

```bash
scrapy crawl search -a keyword="宠孚生物官网" -a engine=bing
```

---

## 自托管指南

完整地将 InfoLens 部署到你自己的基础设施：

### 1. Fork 仓库

在 GitHub 上 fork 本仓库，获得你自己的副本。

### 2. 部署 Cloudflare Worker

```bash
# 安装 Wrangler
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 创建 D1 数据库
cd infolens-cloudflare
wrangler d1 create infolens-prod
# 复制输出的 database_id 到 wrangler.toml

# 执行数据库建表
wrangler d1 execute infolens-prod --file db/schema.sql

# 部署 Worker
npx wrangler deploy --minify
```

部署成功后会输出一个 `*.workers.dev` 地址，这就是你的自定义 API 端点。

### 3. 配置扩展指向自定义 API

1. 打开扩展设置面板
2. 填写「自定义 API 地址」为你的 Worker URL
3. 保存后，所有数据交互将走你自己的 Worker

### 4. （可选）绑定自定义域名

在 Cloudflare Dashboard 中，为 Worker 绑定你自己的域名，实现完全品牌化的 InfoLens 实例。

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
  - [x] 异步同步队列（失败自动重试）
  - [x] Firefox 兼容
  - [x] 可配置 API 地址（自托管支持）
  - [x] CORS 安全限制
  - [x] 评分置信度归一化
  - [x] 可折叠侧边栏
  - [x] 隐私声明
  - [ ] Google 完整支持

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

## 隐私声明

InfoLens 尊重你的隐私，只标注结果，不追踪个人。

### 我们收集的数据

| 数据项 | 说明 | 用途 |
|--------|------|------|
| URL | 你标注的页面地址 | 关联标注到具体网页 |
| 域名 | URL 的根域名 | 计算域名可信评分 |
| 标注类型 | 你选择的标签（👍/👎/📋/⚠️/🔍/📅） | 社区标注聚合 |
| 匿名 UUID | 由扩展本地生成，不关联任何身份信息 | 区分不同用户的标注 |

### 我们 **不** 收集的数据

- **搜索关键词** — 我们不知道你搜了什么
- **浏览历史** — 我们不知道你访问了哪些页面
- **页面内容** — 我们不读取或上传页面文本
- **个人身份信息** — 不需要注册，不收集邮箱/手机号/姓名
- **Cookie 或指纹** — 不设置追踪 Cookie，不做设备指纹

### 数据如何使用

- 你的标注与社区标注聚合，共同影响域名的可信评分
- 评分仅用于在搜索结果旁显示「值得看 / 垃圾」等参考信息
- 所有标注数据通过 Cloudflare D1 全球边缘分发

### 你的权利

- **随时清除数据**：在扩展设置中点击「清除所有数据」，本地标注将被完全删除
- **完全离线使用**：扩展可以不连接任何云端服务独立工作
- **自托管**：可以部署自己的 Worker，数据完全由你掌控

---

## 贡献

欢迎加入！无论你是开发者、编辑、研究者，还是每一个不愿意被算法饲养的普通人。

详细的开发指南请见 [CONTRIBUTING.md](CONTRIBUTING.md)。

📧 cvlk@163.com

---

*InfoLens v0.5.6 · 2026 · 让信息回归透明*

# 贡献指南 — InfoLens

感谢你愿意为 InfoLens 做出贡献！

## 开发环境搭建

### 前置要求

- Python 3.10+（Python Web 部分）
- Node.js 18+（Cloudflare Worker 部署）
- Chrome / Edge / Firefox（测试扩展）

### 克隆仓库

```bash
git clone https://github.com/tronfo/infolens.git
cd infolens
```

### Python Web 环境

```bash
pip install -e .

# 初始化数据库
PYTHONPATH=src python -m infolens init

# 启动本地 Web 服务
PYTHONPATH=src python -m infolens serve
# → http://localhost:8787
```

### 浏览器扩展环境

扩展零构建，直接加载即可使用：

- **Chrome / Edge**：打开 `chrome://extensions/` → 开发者模式 → 加载已解压的扩展程序 → 选择 `infolens-extension/` 目录
- **Firefox**：打开 `about:debugging` → 临时载入附加组件 → 选择 `infolens-extension/manifest-firefox.json`

修改代码后无需重新构建，刷新扩展即可生效。

### Cloudflare Worker 环境

```bash
cd infolens-cloudflare
npm install

# 登录
npx wrangler login

# 本地开发
npx wrangler dev

# 生产部署
npx wrangler deploy --minify
```

## 加载扩展（本地调试）

### Chrome / Edge

1. 打开 `chrome://extensions/` 或 `edge://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目中的 `infolens-extension/` 目录
5. 扩展图标出现在浏览器工具栏

**重新加载**：修改代码后，点击扩展卡片上的刷新图标（圆形箭头）。

### Firefox

1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击「临时载入附加组件」
3. 选择 `infolens-extension/manifest-firefox.json`
4. 扩展加载成功

**重新加载**：修改代码后，点击扩展旁的「重新加载」按钮。

> **注意**：Firefox 使用 `manifest-firefox.json` 而非 `manifest.json`，两者结构略有差异。

## 部署 Cloudflare Worker

1. 确保已安装 [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/)：
   ```bash
   npm install -g wrangler
   ```
2. 登录 Cloudflare：
   ```bash
   wrangler login
   ```
3. 创建 D1 数据库（首次）：
   ```bash
   cd infolens-cloudflare
   wrangler d1 create infolens-prod
   ```
   将输出的 `database_id` 填入 `wrangler.toml` 的 `[[d1_databases]]` binding 中。
4. 执行建表 SQL：
   ```bash
   wrangler d1 execute infolens-prod --file db/schema.sql
   ```
5. 部署：
   ```bash
   npx wrangler deploy --minify
   ```

部署成功后会输出 Worker URL（如 `https://infolens-xxx.yourname.workers.dev`），将此地址填入扩展设置中的「自定义 API 地址」。

## Git 提交规范

提交信息使用 **Conventional Commits** 格式：

```
<type>: <subject>
```

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: 添加 Google 搜索结果支持` |
| `fix` | Bug 修复 | `fix: 修复 Firefox 下浮动栏定位偏移` |
| `docs` | 文档更新 | `docs: 补充自托管部署指南` |
| `style` | 代码格式（不影响功能） | `style: 统一缩进为 2 空格` |
| `refactor` | 重构（不改变行为） | `refactor: 提取评分算法为独立模块` |
| `test` | 测试相关 | `test: 添加数据库 schema 校验` |
| `chore` | 构建/工具/杂项 | `chore: 升级 wrangler 版本` |

### 规则

- 使用中文撰写（或英文均可，但项目以中文为主）
- Subject 不超过 72 个字符
- 使用祈使句（"添加"而非"添加了"，"修复"而非"修复了"）
- 不要以句号结尾

### 示例

```
feat: 添加 DuckDuckGo 搜索结果标注
fix: 修复多语言切换后评分不更新
docs: 更新 FIELDS.md 中 domainScore 字段说明
refactor: 将 compare.py 中的标签逻辑抽离为模块
chore: 升级 version 到 0.5.2
```

## Pull Request 指南

### 提交 PR 前

1. **确保代码可以正常工作**：至少在一种浏览器上测试过
2. **遵循现有代码风格**：保持一致的命名、缩进、注释习惯
3. **更新相关文档**：如果改了字段名或 API 接口，同步更新 `docs/FIELDS.md`
4. **提交信息规范**：使用上述 Conventional Commits 格式

### PR 内容要求

- **标题**：与提交信息格式一致，如 `feat: 添加暗色模式支持`
- **描述**：
  - 改了什么？
  - 为什么改？（关联 issue 或问题背景）
  - 如何测试这个变更？
- **截图**（如涉及 UI 变更）：附上改动前后的对比截图

### 测试 Checklist

| 测试项 | Chrome | Edge | Firefox |
|--------|--------|------|---------|
| 扩展正常加载 | [ ] | [ ] | [ ] |
| 浮动栏正常显示 | [ ] | [ ] | [ ] |
| 搜索结果标注正常 | [ ] | [ ] | [ ] |
| 标注按钮点击生效 | [ ] | [ ] | [ ] |
| 多语言自动切换 | [ ] | [ ] | [ ] |
| 翻页后重新注入 | [ ] | [ ] | [ ] |
| 自定义 API 地址生效 | [ ] | [ ] | [ ] |

> 如果改动仅涉及单一浏览器，只需测试对应浏览器即可。跨浏览器改动的 PR 需要在所有目标浏览器上测试。

### 代码审查流程

1. PR 提交后，维护者会进行代码审查
2. 审查通过后，PR 会被合并到 main 分支
3. 合并时会自动触发版本号递增（chore commit）

## 新增字段流程

涉及数据模型变更时：

1. 先更新 `docs/FIELDS.md`，说明字段名、类型、值域、使用场景、传递过程
2. 更新对应的代码（store.js / worker.ts / models.py 等）
3. 如需数据库 schema 变更，同步更新 `infolens-cloudflare/db/schema.sql`
4. 在 PR 描述中明确标注 "字段变更"

## 联系方式

- 📧 cvlk@163.com
- 官网：[www.tronfo.com](https://www.tronfo.com)

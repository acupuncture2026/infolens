# InfoLens 个人版 — 使用指南

## 安装

```bash
# 安装依赖
pip install fastapi uvicorn feedparser httpx pyyaml jinja2

# 或用 venv
python -m venv .venv && source .venv/bin/activate
pip install fastapi uvicorn feedparser httpx pyyaml jinja2
```

## 快速开始

### 1. 初始化（首次）
```bash
cd infolens
PYTHONPATH=src python -m infolens init
```
载入 10 个预设信源（新华社、财新、Reuters、BBC、36氪等）

### 2. 抓取信息
```bash
PYTHONPATH=src python -m infolens fetch
```
从所有信源抓取文章，自动交叉验证

### 3. 查看结果
```bash
PYTHONPATH=src python -m infolens serve
```
打开浏览器访问 http://localhost:8787

### 4. 查看统计
```bash
PYTHONPATH=src python -m infolens stats
```

### 5. 导出数据
```bash
PYTHONPATH=src python -m infolens export > data.json
```

## 定时抓取

```bash
# 每天早 8 点抓取
0 8 * * * cd /path/to/infolens && PYTHONPATH=src python scripts/cron_fetch.py >> /tmp/infolens.log 2>&1
```

## 自定义信源

在 Web 界面 `POST /api/sources` 添加新信源，或编辑数据库。

## 数据位置

所有数据存储在 `~/.infolens/infolens.db`（SQLite）
